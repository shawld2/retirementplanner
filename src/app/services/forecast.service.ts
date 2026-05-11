import { Injectable, computed, signal } from '@angular/core';
import {
  DrawdownPriority,
  DrawdownYear,
  ForecastInputs,
  ForecastYear,
  LumpSumEvent,
  PropertyAsset,
  MonteCarloResult,
  PensionPot,
  ProjectionSettings,
  TaxBand,
} from '../models/pension.models';

interface LiquidPotState {
  id: string;
  label: string;
  owner: 'me' | 'partner';
  kind: 'dc' | 'isa';
  sourceType: 'pension' | 'isa';
  isaType?: 'ISA' | 'LISA';
  pensionType?: 'DC' | 'DB';
  balance: number;
  uncrystallisedBalance?: number;
  chargesPercent?: number;
  annualContribution: number;
  taxFreePercentage: number;
}

interface PropertyProjectionState {
  id: string;
  label: string;
  propertyType: 'residential' | 'buy-to-let';
  currentValue: number;
  mortgageType: 'repayment' | 'interest-only';
  mortgageOutstanding: number;
  mortgageRatePercent: number;
  mortgageYearsRemaining: number;
  annualRentalIncome: number;
}

interface OwnerAmounts {
  me: number;
  partner: number;
}

interface SourceAmounts {
  pension: number;
  isa: number;
  lisa: number;
}

interface WithdrawalResult {
  total: number;
  taxable: number;
  pclsUsed: number;
  byOwner: OwnerAmounts;
  taxableByOwner: OwnerAmounts;
  bySourceType: SourceAmounts;
}

interface LumpSumResult {
  total: number;
  taxable: number;
  pclsUsed: number;
  byOwner: OwnerAmounts;
  taxableByOwner: OwnerAmounts;
  bySourceType: SourceAmounts;
}

interface TaxApplicationResult {
  taxable: number;
  pclsUsed: number;
  received: number;
}

type RandomFn = () => number;

@Injectable({ providedIn: 'root' })
export class ForecastService {
  private readonly inputsSignal = signal<ForecastInputs | null>(null);
  private readonly monteCarloSignal = signal<MonteCarloResult | null>(null);
  private readonly monteCarloPendingSignal = signal(false);
  private monteCarloWorker: Worker | null = null;
  private monteCarloRequestId = 0;
  private monteCarloTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly forecast = computed(() => {
    const inputs = this.inputsSignal();
    return inputs ? this.calculateForecast(inputs) : [];
  });

  readonly monteCarlo = computed<MonteCarloResult | null>(() => this.monteCarloSignal());
  readonly monteCarloPending = computed<boolean>(() => this.monteCarloPendingSignal());

  setInputs(inputs: ForecastInputs): void {
    this.inputsSignal.set(inputs);
    this.recomputeMonteCarlo(inputs);
  }

  private recomputeMonteCarlo(inputs: ForecastInputs): void {
    const requestId = ++this.monteCarloRequestId;
    this.monteCarloPendingSignal.set(true);

    if (this.monteCarloTimeout !== null) {
      clearTimeout(this.monteCarloTimeout);
      this.monteCarloTimeout = null;
    }

    const shouldUseWorker =
      !!inputs.settings.monteCarloUseWorker && typeof Worker !== 'undefined';

    if (!shouldUseWorker) {
      this.monteCarloTimeout = setTimeout(() => {
        this.monteCarloTimeout = null;
        if (requestId !== this.monteCarloRequestId) {
          return;
        }

        const result = this.calculateMonteCarlo(inputs);
        if (requestId !== this.monteCarloRequestId) {
          return;
        }

        this.monteCarloSignal.set(result);
        this.monteCarloPendingSignal.set(false);
      }, 0);
      return;
    }

    const worker = this.ensureMonteCarloWorker();

    worker.postMessage({
      id: requestId,
      inputs,
    });
  }

  private ensureMonteCarloWorker(): Worker {
    if (this.monteCarloWorker) {
      return this.monteCarloWorker;
    }

    const worker = new Worker(new URL('./forecast-monte-carlo.worker', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = ({ data }: MessageEvent<{ id: number; result: MonteCarloResult }>) => {
      if (!data || data.id !== this.monteCarloRequestId) {
        return;
      }

      this.monteCarloSignal.set(data.result);
      this.monteCarloPendingSignal.set(false);
    };

    worker.onerror = () => {
      const inputs = this.inputsSignal();
      if (!inputs) {
        return;
      }

      this.monteCarloSignal.set(this.calculateMonteCarlo(inputs));
      this.monteCarloPendingSignal.set(false);
    };

    this.monteCarloWorker = worker;
    return worker;
  }

  /**
   * Builds a year-by-year projection from current age through age 100.
   *
   * Calculation order per year:
   * 1) Add ongoing contributions for non-retired owners
   * 2) Apply one-off retirement events (PCLS and DB lump sums)
   * 3) Calculate guaranteed income (DB + state)
   * 4) Apply drawdown requirement and ad-hoc lump sums
   * 5) Apply net investment growth (return minus charges)
   */
  calculateForecast(
    inputs: ForecastInputs,
    options?: { monteCarloVolatilityPercent?: number; random?: RandomFn },
  ): ForecastYear[] {
    const currentYear = new Date().getFullYear();
    const startAge = inputs.me.currentAge;
    const endAge = 100;
    const inflationRate = inputs.settings.inflationPercent / 100;
    const rentalGrowthRate = (inputs.settings.rentalGrowthPercent ?? inputs.settings.inflationPercent) / 100;

    const pots = this.buildInitialPots(inputs);
    const properties = this.buildInitialProperties(inputs.properties ?? []);
    const rows: ForecastYear[] = [];
    const pclsWithdrawnByPot: Record<string, number> = {};
    const crystallisedByPot: Record<string, number> = {};

    for (const pot of pots.filter((p) => p.kind === 'dc')) {
      pclsWithdrawnByPot[pot.id] = 0;
      crystallisedByPot[pot.id] = 0;
    }

    let pclsUsed = 0;
    let exhaustedEver = false;

    for (let meAge = startAge; meAge <= endAge; meAge++) {
      const yearIndex = meAge - startAge;
      const partnerAge = inputs.partner
        ? inputs.partner.currentAge + yearIndex
        : undefined;
      const year = currentYear + yearIndex;
      const inflationFactor = Math.pow(1 + inflationRate, yearIndex);
      const rentalGrowthFactor = Math.pow(1 + rentalGrowthRate, yearIndex);
      const notes: string[] = [];

      const openingBalances = this.snapshotBalances(pots);
      const potLabels = this.snapshotLabels(pots);
      const openingTotal = this.totalLiquidBalance(pots);
      const openingPropertySnapshot = this.snapshotPropertyState(properties);
      const pclsUsedAtYearStart = pclsUsed;

      this.addContributions(pots, inputs, meAge, partnerAge);

      pclsUsed = this.applyRetirementEvents(
        pots,
        inputs,
        meAge,
        partnerAge,
        pclsUsed,
        pclsWithdrawnByPot,
        crystallisedByPot,
        notes,
      );

      const dbIncomeByOwner = this.calculateDbIncomeByOwner(inputs, meAge, partnerAge);
      const dbIncome = dbIncomeByOwner.me + dbIncomeByOwner.partner;
      const stateIncomeByOwner = this.calculateStateIncomeByOwner(
        inputs,
        meAge,
        partnerAge,
        inflationFactor,
      );
      const stateIncome = stateIncomeByOwner.me + stateIncomeByOwner.partner;
      const rentalIncome = this.calculateRentalIncome(properties, rentalGrowthFactor);

      const drawdownPlan = this.getInterpolatedDrawdown(inputs.drawdownSchedule, meAge);
      const drawdownRequired = Math.max(0, drawdownPlan.annualAmount * inflationFactor);
      const liquidPots = pots.filter((p) => p.kind === 'dc' || p.kind === 'isa');

      const futureContributionsAdded = this.applyScheduledFutureContributions(
        liquidPots,
        inputs.futureContributions ?? [],
        meAge,
        notes,
      );

      const eligiblePots = this.getEligibleWithdrawalPots(pots, inputs, meAge, partnerAge);

      const guaranteedIncome = dbIncome + stateIncome + rentalIncome;
      let requiredFromPots = Math.max(0, drawdownRequired - guaranteedIncome);

      // If the user entered net amounts, gross up to find how much must be withdrawn before tax
      if (inputs.settings.drawdownAmountsAreNet && inputs.settings.taxBands?.length) {
        requiredFromPots = this.grossUpDrawdown(
          requiredFromPots,
          guaranteedIncome,
          eligiblePots,
          drawdownPlan.fromSource,
          meAge,
          partnerAge,
          inputs.settings.drawdownPriority,
          inputs.settings.applyPCLSLimit,
          pclsUsed,
          pclsWithdrawnByPot,
          crystallisedByPot,
          inputs.settings.taxBands,
        );
      }

      let drawdownResult: WithdrawalResult;
      const splitEligible = !!inputs.partner && (drawdownPlan.fromSource === 'proportional' || drawdownPlan.fromSource === 'any');

      if (splitEligible) {
        const splitPct = Math.min(100, Math.max(0, inputs.settings.drawdownSplitToMePercent ?? 50));
        const meTarget = requiredFromPots * (splitPct / 100);
        const partnerTarget = Math.max(0, requiredFromPots - meTarget);

        const meResult = this.withdrawFromPots(
          eligiblePots.filter((p) => p.owner === 'me'),
          meTarget,
          drawdownPlan.fromSource,
          meAge,
          partnerAge,
          inputs.settings.drawdownPriority,
          notes,
          inputs.settings.applyPCLSLimit,
          pclsUsed,
          pclsWithdrawnByPot,
          crystallisedByPot,
          true,
        );

        const partnerResult = this.withdrawFromPots(
          eligiblePots.filter((p) => p.owner === 'partner'),
          partnerTarget,
          drawdownPlan.fromSource,
          meAge,
          partnerAge,
          inputs.settings.drawdownPriority,
          notes,
          inputs.settings.applyPCLSLimit,
          meResult.pclsUsed,
          pclsWithdrawnByPot,
          crystallisedByPot,
          true,
        );

        drawdownResult = {
          total: meResult.total + partnerResult.total,
          taxable: meResult.taxable + partnerResult.taxable,
          pclsUsed: partnerResult.pclsUsed,
          byOwner: {
            me: meResult.byOwner.me + partnerResult.byOwner.me,
            partner: meResult.byOwner.partner + partnerResult.byOwner.partner,
          },
          taxableByOwner: {
            me: meResult.taxableByOwner.me + partnerResult.taxableByOwner.me,
            partner: meResult.taxableByOwner.partner + partnerResult.taxableByOwner.partner,
          },
          bySourceType: {
            pension: meResult.bySourceType.pension + partnerResult.bySourceType.pension,
            isa: meResult.bySourceType.isa + partnerResult.bySourceType.isa,
            lisa: meResult.bySourceType.lisa + partnerResult.bySourceType.lisa,
          },
        };

        const unmet = Math.max(0, requiredFromPots - drawdownResult.total);
        if (unmet > 0.01) {
          const topUp = this.withdrawFromPots(
            eligiblePots,
            unmet,
            drawdownPlan.fromSource,
            meAge,
            partnerAge,
            inputs.settings.drawdownPriority,
            notes,
            inputs.settings.applyPCLSLimit,
            drawdownResult.pclsUsed,
            pclsWithdrawnByPot,
            crystallisedByPot,
            true,
          );

          drawdownResult = {
            total: drawdownResult.total + topUp.total,
            taxable: drawdownResult.taxable + topUp.taxable,
            pclsUsed: topUp.pclsUsed,
            byOwner: {
              me: drawdownResult.byOwner.me + topUp.byOwner.me,
              partner: drawdownResult.byOwner.partner + topUp.byOwner.partner,
            },
            taxableByOwner: {
              me: drawdownResult.taxableByOwner.me + topUp.taxableByOwner.me,
              partner: drawdownResult.taxableByOwner.partner + topUp.taxableByOwner.partner,
            },
            bySourceType: {
              pension: drawdownResult.bySourceType.pension + topUp.bySourceType.pension,
              isa: drawdownResult.bySourceType.isa + topUp.bySourceType.isa,
              lisa: drawdownResult.bySourceType.lisa + topUp.bySourceType.lisa,
            },
          };
        }
      } else {
        drawdownResult = this.withdrawFromPots(
          eligiblePots,
          requiredFromPots,
          drawdownPlan.fromSource,
          meAge,
          partnerAge,
          inputs.settings.drawdownPriority,
          notes,
          inputs.settings.applyPCLSLimit,
          pclsUsed,
          pclsWithdrawnByPot,
          crystallisedByPot,
          true,
        );
      }
      pclsUsed = drawdownResult.pclsUsed;

      const lumpSumResult = this.applyScheduledLumpSums(
        eligiblePots,
        inputs.lumpSums,
        meAge,
        partnerAge,
        inputs.settings.drawdownPriority,
        notes,
        inputs.settings.applyPCLSLimit,
        pclsUsed,
        pclsWithdrawnByPot,
        crystallisedByPot,
        true,
      );
      pclsUsed = lumpSumResult.pclsUsed;

      const randomisedGrossRate =
        options?.monteCarloVolatilityPercent !== undefined
          ? this.sampleRandomGrossRate(
              inputs.settings.returnRates[inputs.settings.returnScenario] / 100,
              options.monteCarloVolatilityPercent / 100,
              options.random,
            )
          : undefined;
      const investmentGrowth = this.applyGrowth(pots, inputs.settings, randomisedGrossRate);
      const propertyProjection = this.applyPropertyProjection(properties, inputs.settings);
      const closingTotal = this.totalLiquidBalance(pots);
      const closingPropertySnapshot = this.snapshotPropertyState(properties);
      const pclsSnapshot = this.snapshotPclsState(
        pots,
        pclsWithdrawnByPot,
        crystallisedByPot,
        inputs.settings.applyPCLSLimit,
        pclsUsed,
      );
      const fundsExhausted = closingTotal <= 0.01;

      if (fundsExhausted && !exhaustedEver) {
        notes.push('All DC/ISA funds exhausted');
        exhaustedEver = true;
      }

      // Split rental income by ownership percentage
      const rentalOwnershipMePercent = Math.min(100, Math.max(0, inputs.settings.rentalOwnershipMePercent ?? 100)) / 100;
      const meRentalIncome = rentalIncome * rentalOwnershipMePercent;
      const partnerRentalIncome = rentalIncome * (1 - rentalOwnershipMePercent);

      const meTaxableIncome =
        dbIncomeByOwner.me +
        stateIncomeByOwner.me +
        meRentalIncome +
        drawdownResult.taxableByOwner.me +
        lumpSumResult.taxableByOwner.me;
      const partnerTaxableIncome =
        dbIncomeByOwner.partner +
        stateIncomeByOwner.partner +
        partnerRentalIncome +
        drawdownResult.taxableByOwner.partner +
        lumpSumResult.taxableByOwner.partner;
      const meGuaranteedTaxableIncome = dbIncomeByOwner.me + stateIncomeByOwner.me + meRentalIncome;
      const partnerGuaranteedTaxableIncome = dbIncomeByOwner.partner + stateIncomeByOwner.partner + partnerRentalIncome;
      const meIncomeTax = inputs.settings.taxBands?.length
        ? this.calculateTax(meTaxableIncome, inputs.settings.taxBands)
        : 0;
      const partnerIncomeTax = inputs.settings.taxBands?.length
        ? this.calculateTax(partnerTaxableIncome, inputs.settings.taxBands)
        : 0;
      const taxOnGuaranteedIncome = inputs.settings.taxBands?.length
        ? this.calculateTax(meGuaranteedTaxableIncome, inputs.settings.taxBands)
          + this.calculateTax(partnerGuaranteedTaxableIncome, inputs.settings.taxBands)
        : 0;
      const incomeTax = meIncomeTax + partnerIncomeTax;
      const pclsConsumedThisYear = Math.max(0, pclsUsed - pclsUsedAtYearStart);
      const taxOnPotWithdrawals = Math.max(0, incomeTax - taxOnGuaranteedIncome);
      const grossFromPots = drawdownResult.total + lumpSumResult.total;
      const totalIncome = guaranteedIncome + drawdownResult.total + lumpSumResult.total;
      const netIncome = totalIncome - incomeTax;

      rows.push({
        year,
        meAge,
        partnerAge,
        potBalances: openingBalances,
        potLabels,
        pclsWithdrawnByPot: pclsSnapshot.withdrawn,
        remainingTaxFreeByPot: pclsSnapshot.remaining,
        crystallisedByPot: pclsSnapshot.crystallised,
        totalPotValue: openingTotal,
        totalPropertyValue: openingPropertySnapshot.totalPropertyValue,
        totalMortgageRemaining: openingPropertySnapshot.totalMortgageRemaining,
        totalPropertyEquity: openingPropertySnapshot.totalPropertyEquity,
        rentalIncome,
        propertyGrowth: propertyProjection.propertyGrowth,
        mortgagePrincipalRepaid: propertyProjection.mortgagePrincipalRepaid,
        closingPropertyValue: closingPropertySnapshot.totalPropertyValue,
        closingMortgageRemaining: closingPropertySnapshot.totalMortgageRemaining,
        dbIncome,
        stateIncome,
        drawdownRequired,
        drawdownTaken: drawdownResult.total,
        drawdownFromPension: drawdownResult.bySourceType.pension,
        drawdownFromIsa: drawdownResult.bySourceType.isa,
        drawdownFromLisa: drawdownResult.bySourceType.lisa,
        drawdownTaxable: drawdownResult.taxable,
        futureContributionsAdded,
        lumpSumsTaken: lumpSumResult.total,
        lumpSumsFromPension: lumpSumResult.bySourceType.pension,
        lumpSumsFromIsa: lumpSumResult.bySourceType.isa,
        lumpSumsFromLisa: lumpSumResult.bySourceType.lisa,
        lumpSumsTaxable: lumpSumResult.taxable,
        pclsConsumedThisYear,
        taxableWithdrawals: drawdownResult.taxable + lumpSumResult.taxable,
        totalIncome,
        incomeTax,
        meIncomeTax,
        partnerIncomeTax,
        meTaxableIncome,
        partnerTaxableIncome,
        taxOnGuaranteedIncome,
        taxOnPotWithdrawals,
        grossFromPots,
        netIncome,
        investmentGrowth,
        inflationFactor,
        closingTotalValue: closingTotal,
        fundsExhausted,
        notes,
      });
    }

    return rows;
  }

  private buildInitialProperties(properties: PropertyAsset[]): PropertyProjectionState[] {
    return (properties ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      propertyType: p.propertyType,
      currentValue: Math.max(0, p.currentValue ?? 0),
      mortgageType: p.mortgageType,
      mortgageOutstanding: Math.max(0, p.mortgageOutstanding ?? 0),
      mortgageRatePercent: Math.max(0, p.mortgageRatePercent ?? 0),
      mortgageYearsRemaining: Math.max(0, Math.floor(p.mortgageYearsRemaining ?? 0)),
      annualRentalIncome: Math.max(0, p.annualRentalIncome ?? 0),
    }));
  }

  private calculateRentalIncome(
    properties: PropertyProjectionState[],
    rentalGrowthFactor: number,
  ): number {
    return properties.reduce((sum, property) => {
      if (property.propertyType !== 'buy-to-let') {
        return sum;
      }

      return sum + property.annualRentalIncome * rentalGrowthFactor;
    }, 0);
  }

  private applyPropertyProjection(
    properties: PropertyProjectionState[],
    settings: ProjectionSettings,
  ): { propertyGrowth: number; mortgagePrincipalRepaid: number } {
    const housePriceGrowthRate = settings.housePriceGrowthPercent / 100;
    let propertyGrowth = 0;
    let mortgagePrincipalRepaid = 0;

    for (const property of properties) {
      const growth = property.currentValue * housePriceGrowthRate;
      property.currentValue = Math.max(0, property.currentValue + growth);
      propertyGrowth += growth;

      if (property.mortgageOutstanding <= 0) {
        property.mortgageOutstanding = 0;
        property.mortgageYearsRemaining = Math.max(0, property.mortgageYearsRemaining - 1);
        continue;
      }

      if (property.mortgageYearsRemaining <= 0) {
        mortgagePrincipalRepaid += property.mortgageOutstanding;
        property.mortgageOutstanding = 0;
        continue;
      }

      const annualRate = property.mortgageRatePercent / 100;
      let principalPaid = 0;

      if (property.mortgageType === 'interest-only') {
        if (property.mortgageYearsRemaining === 1) {
          principalPaid = property.mortgageOutstanding;
          property.mortgageOutstanding = 0;
        }
      } else {
        const yearsRemaining = Math.max(1, property.mortgageYearsRemaining);
        const annualPayment = annualRate > 0
          ? property.mortgageOutstanding
            * (annualRate / (1 - Math.pow(1 + annualRate, -yearsRemaining)))
          : property.mortgageOutstanding / yearsRemaining;
        const interest = property.mortgageOutstanding * annualRate;
        principalPaid = Math.max(0, annualPayment - interest);
        principalPaid = Math.min(property.mortgageOutstanding, principalPaid);
        property.mortgageOutstanding = Math.max(0, property.mortgageOutstanding - principalPaid);
      }

      mortgagePrincipalRepaid += principalPaid;
      property.mortgageYearsRemaining = Math.max(0, property.mortgageYearsRemaining - 1);
    }

    return { propertyGrowth, mortgagePrincipalRepaid };
  }

  private snapshotPropertyState(properties: PropertyProjectionState[]): {
    totalPropertyValue: number;
    totalMortgageRemaining: number;
    totalPropertyEquity: number;
  } {
    const totalPropertyValue = properties.reduce((sum, property) => sum + property.currentValue, 0);
    const totalMortgageRemaining = properties.reduce(
      (sum, property) => sum + property.mortgageOutstanding,
      0,
    );

    return {
      totalPropertyValue,
      totalMortgageRemaining,
      totalPropertyEquity: totalPropertyValue - totalMortgageRemaining,
    };
  }

  private calculateMonteCarlo(inputs: ForecastInputs): MonteCarloResult {
    const runs = Math.max(100, Math.min(5000, Math.round(inputs.settings.monteCarloRuns || 500)));
    const volatility = Math.max(0, Math.min(80, inputs.settings.monteCarloVolatilityPercent || 12));
    const useSeed = !!inputs.settings.monteCarloUseSeed;
    const seed = useSeed
      ? Math.max(1, Math.min(2147483646, Math.floor(inputs.settings.monteCarloSeed ?? 12345)))
      : undefined;
    const random = useSeed && seed !== undefined ? this.seededRandom(seed) : () => Math.random();

    const templateRows = this.calculateForecast(inputs);
    const years = templateRows.map((row) => ({
      year: row.year,
      meAge: row.meAge,
      partnerAge: row.partnerAge,
      balances: [] as number[],
      failures: 0,
    }));

    const finalBalances: number[] = [];
    const failureAges: number[] = [];
    let successCount = 0;

    for (let run = 0; run < runs; run++) {
      const runRows = this.calculateForecast(inputs, {
        monteCarloVolatilityPercent: volatility,
        random,
      });

      const failedAt = runRows.find((row) => row.fundsExhausted);
      if (failedAt) {
        failureAges.push(failedAt.meAge);
      } else {
        successCount += 1;
      }

      for (let i = 0; i < runRows.length; i++) {
        years[i].balances.push(runRows[i].closingTotalValue);
        if (failedAt && runRows[i].meAge >= failedAt.meAge) {
          years[i].failures += 1;
        }
      }

      finalBalances.push(runRows[runRows.length - 1]?.closingTotalValue ?? 0);
    }

    return {
      runs,
      seedUsed: seed,
      workerRequested: !!inputs.settings.monteCarloUseWorker,
      modeUsed: 'main-thread',
      successProbability: successCount / runs,
      p5FinalBalance: this.percentile(finalBalances, 0.05),
      p10FinalBalance: this.percentile(finalBalances, 0.1),
      p25FinalBalance: this.percentile(finalBalances, 0.25),
      p50FinalBalance: this.percentile(finalBalances, 0.5),
      p75FinalBalance: this.percentile(finalBalances, 0.75),
      p90FinalBalance: this.percentile(finalBalances, 0.9),
      p95FinalBalance: this.percentile(finalBalances, 0.95),
      medianFailureAge: failureAges.length ? this.percentile(failureAges, 0.5) : undefined,
      finalBalances,
      years: years.map((year) => ({
        year: year.year,
        meAge: year.meAge,
        partnerAge: year.partnerAge,
        p5: this.percentile(year.balances, 0.05),
        p10: this.percentile(year.balances, 0.1),
        p25: this.percentile(year.balances, 0.25),
        p50: this.percentile(year.balances, 0.5),
        p75: this.percentile(year.balances, 0.75),
        p90: this.percentile(year.balances, 0.9),
        p95: this.percentile(year.balances, 0.95),
        failureRate: year.failures / runs,
      })),
    };
  }

  private applyScheduledFutureContributions(
    eligiblePots: LiquidPotState[],
    contributions: Array<{ age: number; amount: number; toSource: string; label: string }>,
    meAge: number,
    notes: string[],
  ): number {
    let totalAdded = 0;

    for (const event of contributions.filter((e) => e.age === meAge && e.amount > 0)) {
      let target: LiquidPotState | undefined;

      if (event.toSource && event.toSource !== 'any') {
        target = eligiblePots.find((p) => p.id === event.toSource);
      }

      if (!target) {
        target = [...eligiblePots]
          .sort((a, b) => b.balance - a.balance)
          .at(0);
      }

      if (!target) {
        notes.push(`Future contribution ${event.label} could not be allocated`);
        continue;
      }

      target.balance += event.amount;
      totalAdded += event.amount;
      if (target.kind === 'dc') {
        target.uncrystallisedBalance = (target.uncrystallisedBalance ?? 0) + event.amount;
      }
      notes.push(
        `Future contribution ${event.label} added to ${target.label}: ${Math.round(event.amount).toLocaleString()}`,
      );
    }

    return totalAdded;
  }

  private getEligibleWithdrawalPots(
    pots: LiquidPotState[],
    inputs: ForecastInputs,
    meAge: number,
    partnerAge: number | undefined,
  ): LiquidPotState[] {
    return pots.filter((pot) => {
      if (pot.balance <= 0) {
        return false;
      }

      if (pot.kind !== 'dc') {
        return true;
      }

      if (pot.owner === 'me') {
        return meAge >= inputs.me.retirementAge;
      }

      if (!inputs.partner || partnerAge === undefined) {
        return false;
      }

      return partnerAge >= inputs.partner.retirementAge;
    });
  }

  private buildInitialPots(inputs: ForecastInputs): LiquidPotState[] {
    const pots: LiquidPotState[] = [];

    for (const pension of inputs.me.pensions) {
      if (pension.type !== 'DC') {
        continue;
      }

      pots.push({
        id: pension.id,
        label: pension.label,
        owner: 'me',
        kind: 'dc',
        sourceType: 'pension',
        pensionType: 'DC',
        balance: pension.currentValue ?? 0,
        uncrystallisedBalance: pension.currentValue ?? 0,
        chargesPercent: pension.chargesPercent,
        annualContribution: (pension.annualContribution ?? 0) + (pension.employerContribution ?? 0),
        taxFreePercentage: pension.taxFreePercentage,
      });
    }

    for (const isa of inputs.me.isas) {
      pots.push({
        id: isa.id,
        label: isa.label,
        owner: 'me',
        kind: 'isa',
        sourceType: 'isa',
        isaType: isa.isaType === 'LISA' ? 'LISA' : 'ISA',
        balance: isa.currentValue,
        chargesPercent: isa.chargesPercent,
        annualContribution: isa.annualContribution,
        taxFreePercentage: 0,
      });
    }

    if (inputs.partner) {
      for (const pension of inputs.partner.pensions) {
        if (pension.type !== 'DC') {
          continue;
        }

        pots.push({
          id: pension.id,
          label: pension.label,
          owner: 'partner',
          kind: 'dc',
          sourceType: 'pension',
          pensionType: 'DC',
          balance: pension.currentValue ?? 0,
          uncrystallisedBalance: pension.currentValue ?? 0,
          chargesPercent: pension.chargesPercent,
          annualContribution:
            (pension.annualContribution ?? 0) + (pension.employerContribution ?? 0),
          taxFreePercentage: pension.taxFreePercentage,
        });
      }

      for (const isa of inputs.partner.isas) {
        pots.push({
          id: isa.id,
          label: isa.label,
          owner: 'partner',
          kind: 'isa',
          sourceType: 'isa',
          isaType: isa.isaType === 'LISA' ? 'LISA' : 'ISA',
          balance: isa.currentValue,
          chargesPercent: isa.chargesPercent,
          annualContribution: isa.annualContribution,
          taxFreePercentage: 0,
        });
      }
    }

    return pots;
  }

  private addContributions(
    pots: LiquidPotState[],
    inputs: ForecastInputs,
    meAge: number,
    partnerAge: number | undefined,
  ): void {
    const applyOwnerIsaContributions = (owner: 'me' | 'partner', ownerAge: number | undefined): void => {
      if (ownerAge === undefined) {
        return;
      }

      let isaAllowanceRemaining = 20000;
      const isaPots = pots
        .filter((pot) => pot.owner === owner && pot.kind === 'isa')
        .sort((a, b) => Number(b.isaType === 'LISA') - Number(a.isaType === 'LISA'));

      for (const pot of isaPots) {
        const requested = Math.max(0, pot.annualContribution);
        if (requested <= 0 || isaAllowanceRemaining <= 0) {
          continue;
        }

        if (pot.isaType === 'LISA') {
          if (ownerAge < 18 || ownerAge >= 50) {
            continue;
          }

          const lisaContribution = Math.min(requested, 4000, isaAllowanceRemaining);
          const lisaBonus = lisaContribution * 0.25;
          pot.balance += lisaContribution + lisaBonus;
          isaAllowanceRemaining -= lisaContribution;
          continue;
        }

        const isaContribution = Math.min(requested, isaAllowanceRemaining);
        pot.balance += isaContribution;
        isaAllowanceRemaining -= isaContribution;
      }
    };

    applyOwnerIsaContributions('me', meAge);
    if (inputs.partner) {
      applyOwnerIsaContributions('partner', partnerAge);
    }

    for (const pot of pots.filter((p) => p.kind === 'dc')) {
      const ownerRetired = pot.owner === 'me'
        ? meAge >= inputs.me.retirementAge
        : !inputs.partner || partnerAge === undefined || partnerAge >= inputs.partner.retirementAge;

      if (!ownerRetired && pot.annualContribution > 0) {
        pot.balance += pot.annualContribution;
        pot.uncrystallisedBalance = (pot.uncrystallisedBalance ?? 0) + pot.annualContribution;
      }
    }
  }

  private applyRetirementEvents(
    pots: LiquidPotState[],
    inputs: ForecastInputs,
    meAge: number,
    partnerAge: number | undefined,
    pclsUsed: number,
    pclsWithdrawnByPot: Record<string, number>,
    crystallisedByPot: Record<string, number>,
    notes: string[],
  ): number {
    if (inputs.partner && partnerAge !== undefined) {
      for (const db of inputs.partner.pensions.filter((p) => p.type === 'DB')) {
        const dbStartAge = this.getDbPensionStartAge(db, inputs.partner.retirementAge);
        if (partnerAge !== dbStartAge) {
          continue;
        }

        const dbLump = db.dbLumpSum ?? 0;
        if (dbLump <= 0) {
          continue;
        }

        const isa = this.ensurePartnerDbCashPot(pots);
        isa.balance += dbLump;
        notes.push(`Partner DB lump sum moved to cash ISA: ${Math.round(dbLump).toLocaleString()}`);
      }
    }

    return pclsUsed;
  }

  private ensurePartnerDbCashPot(pots: LiquidPotState[]): LiquidPotState {
    const existing = pots.find((p) => p.id === 'partner-db-lump-cash');
    if (existing) {
      return existing;
    }

    const created: LiquidPotState = {
      id: 'partner-db-lump-cash',
      label: 'Partner DB Lump Sum Cash ISA',
      owner: 'partner',
      kind: 'isa',
      sourceType: 'isa',
      balance: 0,
      chargesPercent: 0,
      annualContribution: 0,
      taxFreePercentage: 0,
    };

    pots.push(created);
    return created;
  }

  private calculateDbIncomeByOwner(
    inputs: ForecastInputs,
    meAge: number,
    partnerAge: number | undefined,
  ): OwnerAmounts {
    const dbIncome: OwnerAmounts = this.emptyOwnerAmounts();

    for (const p of inputs.me.pensions.filter((pot) => pot.type === 'DB')) {
      const startAge = this.getDbPensionStartAge(p, inputs.me.retirementAge);
      if (meAge >= startAge) {
        dbIncome.me += p.dbAnnualPension ?? 0;
      }
    }

    if (inputs.partner && partnerAge !== undefined) {
      for (const p of inputs.partner.pensions.filter((pot) => pot.type === 'DB')) {
        const startAge = this.getDbPensionStartAge(p, inputs.partner.retirementAge);
        if (partnerAge >= startAge) {
          dbIncome.partner += p.dbAnnualPension ?? 0;
        }
      }
    }

    return dbIncome;
  }

  private calculateStateIncomeByOwner(
    inputs: ForecastInputs,
    meAge: number,
    partnerAge: number | undefined,
    inflationFactor: number,
  ): OwnerAmounts {
    const income = this.emptyOwnerAmounts();

    if (meAge >= inputs.statePersonAge) {
      income.me += inputs.statePersonAmount * inflationFactor;
    }

    if (
      inputs.partner &&
      partnerAge !== undefined &&
      inputs.statePartnerAge !== undefined &&
      inputs.statePartnerAmount !== undefined &&
      partnerAge >= inputs.statePartnerAge
    ) {
      income.partner += inputs.statePartnerAmount * inflationFactor;
    }

    return income;
  }

  private getInterpolatedDrawdown(schedule: DrawdownYear[], meAge: number): DrawdownYear {
    if (!schedule.length) {
      return { age: meAge, annualAmount: 0, fromSource: 'proportional' };
    }

    const sorted = [...schedule].sort((a, b) => a.age - b.age);

    if (meAge < sorted[0].age) {
      return { age: meAge, annualAmount: 0, fromSource: sorted[0].fromSource || 'proportional' };
    }

    if (meAge === sorted[0].age) {
      return { age: meAge, annualAmount: sorted[0].annualAmount, fromSource: sorted[0].fromSource };
    }

    const last = sorted[sorted.length - 1];
    if (meAge >= last.age) {
      return { age: meAge, annualAmount: last.annualAmount, fromSource: last.fromSource };
    }

    for (let i = 0; i < sorted.length - 1; i++) {
      const left = sorted[i];
      const right = sorted[i + 1];
      if (meAge >= left.age && meAge <= right.age) {
        const range = right.age - left.age;
        const fraction = range === 0 ? 0 : (meAge - left.age) / range;
        const amount = left.annualAmount + (right.annualAmount - left.annualAmount) * fraction;
        return { age: meAge, annualAmount: amount, fromSource: left.fromSource || 'proportional' };
      }
    }

    return { age: meAge, annualAmount: 0, fromSource: 'proportional' };
  }

  private applyScheduledLumpSums(
    pots: LiquidPotState[],
    lumpSums: LumpSumEvent[],
    meAge: number,
    partnerAge: number | undefined,
    drawdownPriority: DrawdownPriority,
    notes: string[],
    applyPclsLimit: boolean,
    pclsUsed: number,
    pclsWithdrawnByPot: Record<string, number>,
    crystallisedByPot: Record<string, number>,
    allowTaxFreeCash: boolean,
  ): LumpSumResult {
    let taken = 0;
    let taxable = 0;
    let runningPclsUsed = pclsUsed;
    const byOwner = this.emptyOwnerAmounts();
    const taxableByOwner = this.emptyOwnerAmounts();
    const bySourceType = this.emptySourceAmounts();

    for (const event of lumpSums.filter((e) => e.age === meAge)) {
      const qualifiesLisaFirstHome = this.isQualifyingLisaFirstHomeWithdrawal(event);
      const resolvedSource = event.lisaUseForFirstHome
        ? this.resolveLisaPreferredSource(pots, event.fromSource)
        : event.fromSource;
      if (event.lisaUseForFirstHome && !qualifiesLisaFirstHome) {
        notes.push(
          `LISA first-home rules not met for ${event.label}; pre-60 LISA withdrawals use the 25% charge.`,
        );
      }

      if (event.lisaUseForFirstHome && resolvedSource !== event.fromSource) {
        notes.push(
          `LISA first-home event ${event.label} routed to an available LISA pot.`,
        );
      }

      const amountTaken = this.withdrawFromPots(
        pots,
        event.amount,
        resolvedSource,
        meAge,
        partnerAge,
        drawdownPriority,
        notes,
        applyPclsLimit,
        runningPclsUsed,
        pclsWithdrawnByPot,
        crystallisedByPot,
        allowTaxFreeCash,
        qualifiesLisaFirstHome,
      );
      taken += amountTaken.total;
      taxable += amountTaken.taxable;
      runningPclsUsed = amountTaken.pclsUsed;
      byOwner.me += amountTaken.byOwner.me;
      byOwner.partner += amountTaken.byOwner.partner;
      taxableByOwner.me += amountTaken.taxableByOwner.me;
      taxableByOwner.partner += amountTaken.taxableByOwner.partner;
      bySourceType.pension += amountTaken.bySourceType.pension;
      bySourceType.isa += amountTaken.bySourceType.isa;
      bySourceType.lisa += amountTaken.bySourceType.lisa;
      notes.push(
        `Lump sum event ${event.label}: ${Math.round(amountTaken.total).toLocaleString()}`,
      );
    }

    return { total: taken, taxable, pclsUsed: runningPclsUsed, byOwner, taxableByOwner, bySourceType };
  }

  private isQualifyingLisaFirstHomeWithdrawal(event: LumpSumEvent): boolean {
    if (!event.lisaUseForFirstHome) {
      return false;
    }

    const propertyPrice = Number(event.lisaPropertyPrice ?? 0);
    const monthsOpen = Number(event.lisaMonthsOpen ?? 0);

    return !!event.lisaFirstTimeBuyer
      && propertyPrice > 0
      && propertyPrice <= 450000
      && monthsOpen >= 12;
  }

  private resolveLisaPreferredSource(pots: LiquidPotState[], requestedSource: string): string {
    const lisaCandidates = pots
      .filter((pot) => pot.kind === 'isa' && pot.isaType === 'LISA' && pot.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    if (!lisaCandidates.length) {
      return requestedSource;
    }

    if (!requestedSource || requestedSource === 'any' || requestedSource === 'proportional') {
      return lisaCandidates[0].id;
    }

    const requestedPot = pots.find((pot) => pot.id === requestedSource);
    if (requestedPot?.kind === 'isa' && requestedPot.isaType === 'LISA') {
      return requestedSource;
    }

    return lisaCandidates[0].id;
  }

  private withdrawFromPots(
    pots: LiquidPotState[],
    required: number,
    fromSource: string,
    meAge: number,
    partnerAge: number | undefined,
    drawdownPriority: DrawdownPriority,
    notes: string[],
    applyPclsLimit = false,
    pclsUsed = 0,
    pclsWithdrawnByPot: Record<string, number> = {},
    crystallisedByPot: Record<string, number> = {},
    allowTaxFreeCash = false,
    qualifiesLisaFirstHome = false,
  ): WithdrawalResult {
    if (required <= 0) {
      return {
        total: 0,
        taxable: 0,
        pclsUsed,
        byOwner: this.emptyOwnerAmounts(),
        taxableByOwner: this.emptyOwnerAmounts(),
        bySourceType: this.emptySourceAmounts(),
      };
    }

    let remaining = required;
    let taxable = 0;
    let runningPclsUsed = pclsUsed;
    const byOwner = this.emptyOwnerAmounts();
    const taxableByOwner = this.emptyOwnerAmounts();
    const bySourceType = this.emptySourceAmounts();

    if (fromSource && fromSource !== 'proportional' && fromSource !== 'any') {
      const source = pots.find((p) => p.id === fromSource);
      if (source && source.balance > 0) {
        const take = Math.min(source.balance, remaining);
        source.balance -= take;
        const applied = this.applyWithdrawalTax(
          source,
          take,
          source.owner === 'me' ? meAge : partnerAge,
          qualifiesLisaFirstHome,
          applyPclsLimit,
          runningPclsUsed,
          pclsWithdrawnByPot,
          crystallisedByPot,
          allowTaxFreeCash,
        );
        remaining -= applied.received;
        taxable += applied.taxable;
        runningPclsUsed = applied.pclsUsed;
        byOwner[source.owner] += applied.received;
        taxableByOwner[source.owner] += applied.taxable;
        if (source.sourceType === 'isa' && source.isaType === 'LISA') {
          bySourceType.lisa += applied.received;
        } else {
          bySourceType[source.sourceType] += applied.received;
        }
      }
    }

    if (remaining > 0 && fromSource === 'proportional') {
      const orderedKinds = this.getOrderedKinds(drawdownPriority);
      for (const kind of orderedKinds) {
        if (remaining <= 0) {
          break;
        }
        const candidates = pots.filter((p) => p.kind === kind && p.balance > 0);
        const result = this.withdrawProportionally(
          candidates,
          remaining,
          meAge,
          partnerAge,
          applyPclsLimit,
          runningPclsUsed,
          pclsWithdrawnByPot,
          crystallisedByPot,
          allowTaxFreeCash,
          qualifiesLisaFirstHome,
        );
        remaining = result.remaining;
        taxable += result.taxable;
        runningPclsUsed = result.pclsUsed;
        byOwner.me += result.byOwner.me;
        byOwner.partner += result.byOwner.partner;
        taxableByOwner.me += result.taxableByOwner.me;
        taxableByOwner.partner += result.taxableByOwner.partner;
        bySourceType.pension += result.bySourceType.pension;
        bySourceType.isa += result.bySourceType.isa;
        bySourceType.lisa += result.bySourceType.lisa;
      }
    }

    if (remaining > 0 && fromSource !== 'proportional') {
      const orderedKinds = this.getOrderedKinds(drawdownPriority);
      for (const kind of orderedKinds) {
        if (remaining <= 0) {
          break;
        }

        const potsByKind = pots
          .filter((p) => p.kind === kind && p.balance > 0)
          .sort((a, b) => b.balance - a.balance);
        for (const pot of potsByKind) {
          const take = Math.min(pot.balance, remaining);
          pot.balance -= take;
          const applied = this.applyWithdrawalTax(
            pot,
            take,
            pot.owner === 'me' ? meAge : partnerAge,
            qualifiesLisaFirstHome,
            applyPclsLimit,
            runningPclsUsed,
            pclsWithdrawnByPot,
            crystallisedByPot,
            allowTaxFreeCash,
          );
          remaining -= applied.received;
          taxable += applied.taxable;
          runningPclsUsed = applied.pclsUsed;
          byOwner[pot.owner] += applied.received;
          taxableByOwner[pot.owner] += applied.taxable;
          if (pot.sourceType === 'isa' && pot.isaType === 'LISA') {
            bySourceType.lisa += applied.received;
          } else {
            bySourceType[pot.sourceType] += applied.received;
          }
          if (remaining <= 0) {
            break;
          }
        }
      }
    }

    const withdrawn = required - remaining;
    if (remaining > 0.01) {
      notes.push(`Income shortfall: ${Math.round(remaining).toLocaleString()}`);
    }

    return {
      total: withdrawn,
      taxable,
      pclsUsed: runningPclsUsed,
      byOwner,
      taxableByOwner,
      bySourceType,
    };
  }

  private getOrderedKinds(drawdownPriority: DrawdownPriority): Array<'dc' | 'isa'> {
    return drawdownPriority === 'isa-first' ? ['isa', 'dc'] : ['dc', 'isa'];
  }

  private withdrawProportionally(
    candidates: LiquidPotState[],
    required: number,
    meAge: number,
    partnerAge: number | undefined,
    applyPclsLimit: boolean,
    pclsUsed: number,
    pclsWithdrawnByPot: Record<string, number>,
    crystallisedByPot: Record<string, number>,
    allowTaxFreeCash: boolean,
    qualifiesLisaFirstHome: boolean,
  ): {
    remaining: number;
    taxable: number;
    pclsUsed: number;
    byOwner: OwnerAmounts;
    taxableByOwner: OwnerAmounts;
    bySourceType: SourceAmounts;
  } {
    if (required <= 0 || candidates.length === 0) {
      return {
        remaining: required,
        taxable: 0,
        pclsUsed,
        byOwner: this.emptyOwnerAmounts(),
        taxableByOwner: this.emptyOwnerAmounts(),
        bySourceType: this.emptySourceAmounts(),
      };
    }

    const total = candidates.reduce((sum, pot) => sum + pot.balance, 0);
    if (total <= 0) {
      return {
        remaining: required,
        taxable: 0,
        pclsUsed,
        byOwner: this.emptyOwnerAmounts(),
        taxableByOwner: this.emptyOwnerAmounts(),
        bySourceType: this.emptySourceAmounts(),
      };
    }

    let remaining = required;
    let taxable = 0;
    let runningPclsUsed = pclsUsed;
    const byOwner = this.emptyOwnerAmounts();
    const taxableByOwner = this.emptyOwnerAmounts();
    const bySourceType = this.emptySourceAmounts();

    for (const pot of candidates) {
      if (remaining <= 0) {
        break;
      }

      const share = required * (pot.balance / total);
      const take = Math.min(pot.balance, share, remaining);
      pot.balance -= take;
      const applied = this.applyWithdrawalTax(
        pot,
        take,
        pot.owner === 'me' ? meAge : partnerAge,
        qualifiesLisaFirstHome,
        applyPclsLimit,
        runningPclsUsed,
        pclsWithdrawnByPot,
        crystallisedByPot,
        allowTaxFreeCash,
      );
      remaining -= applied.received;
      taxable += applied.taxable;
      runningPclsUsed = applied.pclsUsed;
      byOwner[pot.owner] += applied.received;
      taxableByOwner[pot.owner] += applied.taxable;
      if (pot.sourceType === 'isa' && pot.isaType === 'LISA') {
        bySourceType.lisa += applied.received;
      } else {
        bySourceType[pot.sourceType] += applied.received;
      }
    }

    if (remaining > 0.01) {
      for (const pot of candidates) {
        if (remaining <= 0) {
          break;
        }

        const take = Math.min(pot.balance, remaining);
        pot.balance -= take;
        const applied = this.applyWithdrawalTax(
          pot,
          take,
          pot.owner === 'me' ? meAge : partnerAge,
          qualifiesLisaFirstHome,
          applyPclsLimit,
          runningPclsUsed,
          pclsWithdrawnByPot,
          crystallisedByPot,
          allowTaxFreeCash,
        );
        remaining -= applied.received;
        taxable += applied.taxable;
        runningPclsUsed = applied.pclsUsed;
        byOwner[pot.owner] += applied.received;
        taxableByOwner[pot.owner] += applied.taxable;
        if (pot.sourceType === 'isa' && pot.isaType === 'LISA') {
          bySourceType.lisa += applied.received;
        } else {
          bySourceType[pot.sourceType] += applied.received;
        }
      }
    }

    return {
      remaining,
      taxable,
      pclsUsed: runningPclsUsed,
      byOwner,
      taxableByOwner,
      bySourceType,
    };
  }

  private emptyOwnerAmounts(): OwnerAmounts {
    return { me: 0, partner: 0 };
  }

  private emptySourceAmounts(): SourceAmounts {
    return { pension: 0, isa: 0, lisa: 0 };
  }

  private applyGrowth(
    pots: LiquidPotState[],
    settings: ProjectionSettings,
    grossRateOverride?: number,
  ): number {
    let growthTotal = 0;
    const grossRate = grossRateOverride ?? settings.returnRates[settings.returnScenario] / 100;

    for (const pot of pots) {
      if (pot.balance <= 0) {
        pot.balance = 0;
        continue;
      }

      const chargeRate = (pot.chargesPercent ?? settings.globalChargesPercent) / 100;
      const netRate = grossRate - chargeRate;
      const growth = pot.balance * netRate;
      pot.balance = Math.max(0, pot.balance + growth);
      if (pot.kind === 'dc') {
        pot.uncrystallisedBalance = Math.max(0, (pot.uncrystallisedBalance ?? 0) * (1 + netRate));
        pot.uncrystallisedBalance = Math.min(pot.uncrystallisedBalance, pot.balance);
      }
      growthTotal += growth;
    }

    return growthTotal;
  }

  private sampleRandomGrossRate(
    mean: number,
    volatility: number,
    random: RandomFn = () => Math.random(),
  ): number {
    if (volatility <= 0) {
      return mean;
    }

    const randomStdNormal = Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12)))
      * Math.cos(2 * Math.PI * random());
    const sampled = mean + randomStdNormal * volatility;

    // Keep simulations in a realistic range to avoid unstable compounding tails.
    return Math.min(1.2, Math.max(-0.95, sampled));
  }

  private percentile(values: number[], q: number): number {
    if (!values.length) {
      return 0;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const clampedQ = Math.min(1, Math.max(0, q));
    const idx = clampedQ * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) {
      return sorted[lower];
    }

    const weight = idx - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  private seededRandom(seed: number): RandomFn {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private snapshotBalances(pots: LiquidPotState[]): Record<string, number> {
    return pots.reduce<Record<string, number>>((acc, pot) => {
      acc[pot.id] = pot.balance;
      return acc;
    }, {});
  }

  private snapshotLabels(pots: LiquidPotState[]): Record<string, string> {
    return pots.reduce<Record<string, string>>((acc, pot) => {
      acc[pot.id] = pot.label;
      return acc;
    }, {});
  }

  private snapshotPclsState(
    pots: LiquidPotState[],
    pclsWithdrawnByPot: Record<string, number>,
    crystallisedByPot: Record<string, number>,
    applyPclsLimit: boolean,
    pclsUsed: number,
  ): {
    withdrawn: Record<string, number>;
    remaining: Record<string, number>;
    crystallised: Record<string, number>;
  } {
    const withdrawn: Record<string, number> = { ...pclsWithdrawnByPot };
    const crystallised: Record<string, number> = { ...crystallisedByPot };
    const remainingRaw: Record<string, number> = {};

    for (const pot of pots.filter((p) => p.kind === 'dc')) {
      const pct = Math.max(0, Math.min(25, pot.taxFreePercentage));
      const uncrystallised = Math.max(0, pot.uncrystallisedBalance ?? 0);
      remainingRaw[pot.id] = uncrystallised * (pct / 100);
      if (!(pot.id in withdrawn)) {
        withdrawn[pot.id] = 0;
      }
      if (!(pot.id in crystallised)) {
        crystallised[pot.id] = 0;
      }
    }

    if (!applyPclsLimit) {
      return {
        withdrawn,
        remaining: remainingRaw,
        crystallised,
      };
    }

    const pclsLimit = 268275;
    const limitRemaining = Math.max(0, pclsLimit - pclsUsed);
    const totalRawRemaining = Object.values(remainingRaw).reduce((sum, value) => sum + value, 0);
    const scale = totalRawRemaining > 0 ? Math.min(1, limitRemaining / totalRawRemaining) : 1;

    const remainingScaled = Object.entries(remainingRaw).reduce<Record<string, number>>(
      (acc, [id, value]) => {
        acc[id] = value * scale;
        return acc;
      },
      {},
    );

    return {
      withdrawn,
      remaining: remainingScaled,
      crystallised,
    };
  }

  private totalLiquidBalance(pots: LiquidPotState[]): number {
    return pots.reduce((total, pot) => total + pot.balance, 0);
  }

  private applyWithdrawalTax(
    pot: LiquidPotState,
    amount: number,
    ownerAge: number | undefined,
    qualifiesLisaFirstHome: boolean,
    applyPclsLimit: boolean,
    pclsUsed: number,
    pclsWithdrawnByPot: Record<string, number>,
    crystallisedByPot: Record<string, number>,
    allowTaxFreeCash: boolean,
  ): TaxApplicationResult {
    if (amount <= 0) {
      return { taxable: 0, pclsUsed, received: 0 };
    }

    if (pot.kind === 'isa') {
      if (pot.isaType === 'LISA' && (ownerAge ?? 0) < 60) {
        if (qualifiesLisaFirstHome) {
          return { taxable: 0, pclsUsed, received: amount };
        }

        return {
          taxable: 0,
          pclsUsed,
          // 25% withdrawal charge for non-qualifying LISA withdrawals before age 60.
          received: amount * 0.75,
        };
      }

      return { taxable: 0, pclsUsed, received: amount };
    }

    if (!allowTaxFreeCash) {
      return { taxable: amount, pclsUsed, received: amount };
    }

    const pct = Math.max(0, Math.min(25, pot.taxFreePercentage));
    if (pct <= 0) {
      return { taxable: amount, pclsUsed, received: amount };
    }

    const uncrystallised = Math.max(0, pot.uncrystallisedBalance ?? 0);
    const pclsLimit = 268275;
    const availablePcls = applyPclsLimit ? Math.max(0, pclsLimit - pclsUsed) : Number.POSITIVE_INFINITY;
    const availableTaxFreeCash = Math.min(uncrystallised * (pct / 100), availablePcls);
    const requestedTaxFree = amount * (pct / 100);
    const taxFree = Math.min(requestedTaxFree, availableTaxFreeCash);

    if (taxFree <= 0) {
      return { taxable: amount, pclsUsed, received: amount };
    }

    const crystallisedAmount = taxFree / (pct / 100);
    const nextPclsUsed = pclsUsed + taxFree;

    pclsWithdrawnByPot[pot.id] = (pclsWithdrawnByPot[pot.id] ?? 0) + taxFree;
    crystallisedByPot[pot.id] = (crystallisedByPot[pot.id] ?? 0) + crystallisedAmount;
    pot.uncrystallisedBalance = Math.max(0, uncrystallised - crystallisedAmount);

    const taxable = amount - taxFree;
    return { taxable, pclsUsed: nextPclsUsed, received: amount };
  }

  private getDbPensionStartAge(pension: PensionPot, fallbackRetirementAge: number): number {
    const configuredAge = pension.dbPensionAge;
    if (configuredAge === undefined || configuredAge === null || Number.isNaN(configuredAge)) {
      return fallbackRetirementAge;
    }

    return configuredAge;
  }

  /**
   * Computes total income tax owed given taxable income and a set of marginal tax bands.
   * Bands must have a `from` (lower bound) and `rate` (percentage). The first band typically
   * has rate=0 representing a personal allowance.
   */
  calculateTax(taxableIncome: number, bands: TaxBand[]): number {
    if (!bands.length || taxableIncome <= 0) {
      return 0;
    }

    const sorted = [...bands].sort((a, b) => a.from - b.from);
    let tax = 0;

    for (let i = 0; i < sorted.length; i++) {
      const band = sorted[i];
      const nextFrom = i + 1 < sorted.length ? sorted[i + 1].from : Infinity;
      const lower = band.from;
      const upper = nextFrom;

      if (taxableIncome <= lower) {
        break;
      }

      const taxableInBand = Math.min(taxableIncome, upper) - lower;
      tax += taxableInBand * (band.rate / 100);
    }

    return tax;
  }

  /**
   * Given a target net-from-pots amount, iteratively finds the gross withdrawal needed.
   *
   * @param targetNet        - Desired net income from pot withdrawals (after tax)
   * @param guaranteedTaxable - Already-taxable guaranteed income (DB + state) in this year
   * @param bands            - Tax bands
   */
  private grossUpDrawdown(
    targetNet: number,
    guaranteedTaxable: number,
    pots: LiquidPotState[],
    fromSource: string,
    meAge: number,
    partnerAge: number | undefined,
    drawdownPriority: DrawdownPriority,
    applyPclsLimit: boolean,
    pclsUsed: number,
    pclsWithdrawnByPot: Record<string, number>,
    crystallisedByPot: Record<string, number>,
    bands: TaxBand[],
  ): number {
    if (targetNet <= 0 || !bands.length) {
      return targetNet;
    }

    let gross = targetNet;
    const maxGross = this.totalLiquidBalance(pots);
    const taxOnGuaranteed = this.calculateTax(guaranteedTaxable, bands);

    for (let i = 0; i < 10; i++) {
      const estimatedTaxableFromPots = this.estimateTaxableForWithdrawal(
        pots,
        gross,
        fromSource,
        meAge,
        partnerAge,
        drawdownPriority,
        applyPclsLimit,
        pclsUsed,
        pclsWithdrawnByPot,
        crystallisedByPot,
      );
      const totalTaxable = guaranteedTaxable + estimatedTaxableFromPots;
      const taxOnAll = this.calculateTax(totalTaxable, bands);
      const taxOnPotWithdrawals = Math.max(0, taxOnAll - taxOnGuaranteed);
      const currentNet = gross - taxOnPotWithdrawals;
      const diff = targetNet - currentNet;
      if (Math.abs(diff) < 1) {
        break;
      }

      gross = Math.max(0, Math.min(maxGross, gross + diff));
    }

    return Math.max(0, gross);
  }

  private estimateTaxableForWithdrawal(
    pots: LiquidPotState[],
    required: number,
    fromSource: string,
    meAge: number,
    partnerAge: number | undefined,
    drawdownPriority: DrawdownPriority,
    applyPclsLimit: boolean,
    pclsUsed: number,
    pclsWithdrawnByPot: Record<string, number>,
    crystallisedByPot: Record<string, number>,
  ): number {
    if (required <= 0) {
      return 0;
    }

    const simulationPots = pots.map((pot) => ({ ...pot }));
    const simulationWithdrawn = { ...pclsWithdrawnByPot };
    const simulationCrystallised = { ...crystallisedByPot };
    const result = this.withdrawFromPots(
      simulationPots,
      required,
      fromSource,
      meAge,
      partnerAge,
      drawdownPriority,
      [],
      applyPclsLimit,
      pclsUsed,
      simulationWithdrawn,
      simulationCrystallised,
      true,
    );

    return result.taxable;
  }
}

