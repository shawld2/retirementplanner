import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { debounceTime, Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatStepperModule } from '@angular/material/stepper';
import { MatIconModule } from '@angular/material/icon';
import { ForecastService } from '../../../services/forecast.service';
import {
  DrawdownPriority,
  DrawdownYear,
  ForecastInputs,
  FutureContributionEvent,
  IsaPot,
  LumpSumEvent,
  PensionPot,
  PropertyAsset,
  ProjectionSettings,
  ReturnScenario,
  TaxBand,
} from '../../../models/pension.models';
import { PersonalInputsComponent } from '../../inputs/personal-inputs/personal-inputs.component';
import { PortfolioInputsComponent } from '../../inputs/portfolio-inputs/portfolio-inputs.component';
import { ProjectionSettingsComponent } from '../../inputs/projection-settings/projection-settings.component';
import { DrawdownPlanComponent } from '../../inputs/drawdown-plan/drawdown-plan.component';
import { ForecastChartComponent } from '../../outputs/forecast-chart/forecast-chart.component';
import { ForecastMonteCarloComponent } from '../../outputs/forecast-monte-carlo/forecast-monte-carlo.component';
import { ForecastTableComponent } from '../../outputs/forecast-table/forecast-table.component';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatTabsModule,
    MatStepperModule,
    MatIconModule,
    PersonalInputsComponent,
    PortfolioInputsComponent,
    ProjectionSettingsComponent,
    DrawdownPlanComponent,
    ForecastChartComponent,
    ForecastMonteCarloComponent,
    ForecastTableComponent,
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent implements OnDestroy {
  private static readonly STORAGE_KEY = 'retirement-planner-inputs-v1';

  private readonly fb = inject(FormBuilder);
  private readonly forecastService = inject(ForecastService);
  private readonly sub = new Subscription();

  readonly form = this.fb.group({
    personal: this.fb.group({
      meCurrentAge: this.fb.control(40, [Validators.required, Validators.min(18), Validators.max(100)]),
      meRetirementAge: this.fb.control(67, [Validators.required, Validators.min(40), Validators.max(100)]),
      includePartner: this.fb.control(false, [Validators.required]),
      partnerCurrentAge: this.fb.control(38),
      partnerRetirementAge: this.fb.control(67),
      statePersonAge: this.fb.control(67, [Validators.required]),
      statePersonAmount: this.fb.control(12000, [Validators.required, Validators.min(0)]),
      statePartnerAge: this.fb.control(67),
      statePartnerAmount: this.fb.control(10000),
    }),
    portfolio: this.fb.group({
      mePensions: this.fb.array([this.createPension('Me Workplace DC', 'DC')]),
      meIsas: this.fb.array([this.createIsa('Me Stocks ISA', 'ISA')]),
      partnerPensions: this.fb.array([this.createPension('Partner Pension', 'DB')]),
      partnerIsas: this.fb.array([this.createIsa('Partner Stocks ISA', 'ISA')]),
      properties: this.fb.array([]),
    }),
    settings: this.fb.group({
      inflationPercent: this.fb.control(2.5, [Validators.required, Validators.min(0), Validators.max(100)]),
      dbPensionIncreasePercent: this.fb.control(0, [Validators.required, Validators.min(0), Validators.max(100)]),
      statePensionIncreasePercent: this.fb.control(2.5, [Validators.required, Validators.min(0), Validators.max(100)]),
      cashIsaPercent: this.fb.control(2.5, [Validators.required, Validators.min(0), Validators.max(100)]),
      rentalGrowthPercent: this.fb.control(2.5, [Validators.required, Validators.min(0), Validators.max(100)]),
      housePriceGrowthPercent: this.fb.control(2.5, [Validators.required, Validators.min(0), Validators.max(100)]),
      rentalOwnershipMePercent: this.fb.control(100, [Validators.required, Validators.min(0), Validators.max(100)]),
      globalChargesPercent: this.fb.control(0.75, [Validators.required, Validators.min(0), Validators.max(100)]),
      returnScenario: this.fb.control<ReturnScenario>('medium', [Validators.required]),
      drawdownPriority: this.fb.control<'pension-first' | 'isa-first'>('pension-first', [Validators.required]),
      drawdownSplitToMePercent: this.fb.control(50, [Validators.required, Validators.min(0), Validators.max(100)]),
      returnRates: this.fb.group({
        low: this.fb.control(3, [Validators.required, Validators.min(0), Validators.max(100)]),
        medium: this.fb.control(5, [Validators.required, Validators.min(0), Validators.max(100)]),
        high: this.fb.control(7, [Validators.required, Validators.min(0), Validators.max(100)]),
      }),
      applyPCLSLimit: this.fb.control(false, [Validators.required]),
      pensionAccessAge: this.fb.control(57, [Validators.required, Validators.min(50), Validators.max(75)]),
      drawdownAmountsAreNet: this.fb.control(false),
      monteCarloRuns: this.fb.control(500, [Validators.required, Validators.min(100), Validators.max(5000)]),
      monteCarloVolatilityPercent: this.fb.control(12, [Validators.required, Validators.min(0), Validators.max(80)]),
      monteCarloUseSeed: this.fb.control(false),
      monteCarloSeed: this.fb.control(12345, [Validators.min(1)]),
      monteCarloUseWorker: this.fb.control(true),
      taxBands: this.fb.array(this.defaultTaxBands().map((b) => this.createTaxBandGroup(b))),
    }),
    drawdown: this.fb.group({
      lumpSums: this.fb.array([]),
      futureContributions: this.fb.array([]),
      drawdownSchedule: this.fb.array([
        this.fb.group({
          age: this.fb.control(67, [Validators.required]),
          annualAmount: this.fb.control(30000, [Validators.required, Validators.min(0)]),
          fromSource: this.fb.control('proportional', [Validators.required]),
        }),
      ]),
    }),
  });

  readonly forecastRows = computed(() => this.forecastService.forecast());
  readonly monteCarloResult = computed(() => this.forecastService.monteCarlo());
  readonly isMonteCarloCalculating = computed(() => this.forecastService.monteCarloPending());
  readonly sourceOptions = signal<Array<{ id: string; label: string }>>([]);

  readonly summary = computed(() => {
    const rows = this.forecastRows();
    const firstExhausted = rows.find((r) => r.fundsExhausted);
    const totalDb = rows.reduce((sum, row) => sum + row.dbIncome, 0);
    const totalState = rows.reduce((sum, row) => sum + row.stateIncome, 0);

    return {
      totalDb,
      totalState,
      exhaustion: firstExhausted
        ? `${firstExhausted.year} (age ${firstExhausted.meAge})`
        : 'Funds last beyond age 100',
    };
  });

  constructor() {
    this.loadFromLocalStorage();
    this.refreshSourceOptions();

    this.sub.add(
      this.form.valueChanges.pipe(debounceTime(500)).subscribe(() => {
        this.refreshSourceOptions();
        this.persistInputs();
        this.recalculate();
      }),
    );
    this.recalculate();
  }

  get personalGroup(): FormGroup {
    return this.form.get('personal') as FormGroup;
  }

  get portfolioGroup(): FormGroup {
    return this.form.get('portfolio') as FormGroup;
  }

  get settingsGroup(): FormGroup {
    return this.form.get('settings') as FormGroup;
  }

  get drawdownGroup(): FormGroup {
    return this.form.get('drawdown') as FormGroup;
  }

  get includePartner(): boolean {
    return !!this.personalGroup.get('includePartner')?.value;
  }

  get drawdownPriorityLabel(): string {
    const priority = this.settingsGroup.get('drawdownPriority')?.value;
    return priority === 'isa-first' ? 'ISA First' : 'Pension First';
  }

  private buildSourceOptions(): Array<{ id: string; label: string }> {
    const mePensions = (this.portfolioGroup.get('mePensions') as FormArray<FormGroup>).getRawValue();
    const meIsas = (this.portfolioGroup.get('meIsas') as FormArray<FormGroup>).getRawValue();
    const partnerPensions = (this.portfolioGroup.get('partnerPensions') as FormArray<FormGroup>).getRawValue();
    const partnerIsas = (this.portfolioGroup.get('partnerIsas') as FormArray<FormGroup>).getRawValue();

    const all = [...mePensions, ...meIsas, ...partnerPensions, ...partnerIsas];
    return all
      .filter((p) => !!p['id'])
      .filter((p) => p['type'] !== 'DB')
      .map((p) => {
        const accountType = p['isaType'] === 'LISA'
          ? 'LISA'
          : (p['isaType'] === 'CASH_ISA' ? 'Cash ISA' : (p['isaType'] === 'ISA' ? 'Stocks ISA' : 'Pension'));
        const baseLabel = (p['label'] as string) || (p['id'] as string);
        return {
          id: p['id'] as string,
          label: `${baseLabel} (${accountType})`,
        };
      });
  }

  private refreshSourceOptions(): void {
    this.sourceOptions.set(this.buildSourceOptions());
  }

  recalculate(): void {
    if (this.form.invalid) {
      return;
    }

    this.forecastService.setInputs(this.toForecastInputs());
  }

  onScenarioChanged(scenario: ReturnScenario): void {
    this.settingsGroup.patchValue({ returnScenario: scenario });
  }

  onDrawdownPriorityChanged(priority: DrawdownPriority): void {
    this.settingsGroup.patchValue({ drawdownPriority: priority });
  }

  exportToJson(): void {
    const payload = JSON.stringify(this.form.getRawValue(), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'retirement-forecast-inputs.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  importFromJson(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        this.loadFormValue(parsed);
        this.persistInputs();
        this.recalculate();
      } catch {
        console.error('Invalid JSON import file.');
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  get taxBandsArray(): FormArray {
    return this.settingsGroup.get('taxBands') as FormArray;
  }

  addTaxBand(): void {
    this.taxBandsArray.push(this.createTaxBandGroup({ from: 0, rate: 0 }));
  }

  removeTaxBand(i: number): void {
    this.taxBandsArray.removeAt(i);
  }

  private defaultTaxBands(): TaxBand[] {
    return [
      { from: 0, rate: 0 },
      { from: 12570, rate: 20 },
      { from: 50270, rate: 40 },
      { from: 125140, rate: 45 },
    ];
  }

  private createTaxBandGroup(band: TaxBand): FormGroup {
    return this.fb.group({
      from: this.fb.control(band.from, [Validators.required, Validators.min(0)]),
      rate: this.fb.control(band.rate, [Validators.required, Validators.min(0), Validators.max(100)]),
    });
  }

  private createPension(label: string, type: 'DC' | 'DB'): FormGroup {
    return this.fb.group({
      id: this.fb.control(crypto.randomUUID(), { nonNullable: true }),
      label: this.fb.control(label, [Validators.required]),
      type: this.fb.control(type, [Validators.required]),
      currentValue: this.fb.control(type === 'DC' ? 100000 : null),
      annualContribution: this.fb.control(type === 'DC' ? 5000 : 0),
      employerContribution: this.fb.control(type === 'DC' ? 3000 : 0),
      dbAnnualPension: this.fb.control(type === 'DB' ? 14000 : null),
      dbLumpSum: this.fb.control(type === 'DB' ? 25000 : null),
      dbPensionAge: this.fb.control(type === 'DB' ? 60 : null),
      taxFreePercentage: this.fb.control(type === 'DC' ? 25 : 0),
      chargesPercent: this.fb.control(0),
    });
  }

  private createIsa(label: string, isaType: 'ISA' | 'LISA' | 'CASH_ISA'): FormGroup {
    return this.fb.group({
      id: this.fb.control(crypto.randomUUID(), { nonNullable: true }),
      label: this.fb.control(label, [Validators.required]),
      isaType: this.fb.control<'ISA' | 'LISA' | 'CASH_ISA'>(isaType, [Validators.required]),
      currentValue: this.fb.control(25000, [Validators.min(0)]),
      annualContribution: this.fb.control(4000, [Validators.min(0)]),
      chargesPercent: this.fb.control(0),
    });
  }

  private toForecastInputs(): ForecastInputs {
    const personal = this.personalGroup.getRawValue();
    const portfolio = this.portfolioGroup.getRawValue();
    const settings = this.settingsGroup.getRawValue();
    const drawdown = this.drawdownGroup.getRawValue();

    const lumpSums = ((drawdown.lumpSums ?? []) as LumpSumEvent[]).map((e) => ({
      ...e,
      age: Number(e.age),
      amount: Number(e.amount),
      lisaUseForFirstHome: !!e.lisaUseForFirstHome,
      lisaFirstTimeBuyer: !!e.lisaFirstTimeBuyer,
      lisaPropertyPrice: Number(e.lisaPropertyPrice ?? 0),
      lisaMonthsOpen: Number(e.lisaMonthsOpen ?? 0),
    }));

    const futureContributions = ((drawdown.futureContributions ?? []) as FutureContributionEvent[]).map((e) => ({
      ...e,
      age: Number(e.age),
      amount: Number(e.amount),
    }));

    const schedule = ((drawdown.drawdownSchedule ?? []) as DrawdownYear[])
      .map((e) => ({
        ...e,
        age: Number(e.age),
        annualAmount: Number(e.annualAmount),
      }))
      .sort((a, b) => a.age - b.age);

    const normalizePension = (pension: PensionPot): PensionPot => ({
      ...pension,
      id: String(pension.id),
      label: String(pension.label ?? ''),
      type: pension.type === 'DB' ? 'DB' : 'DC',
      currentValue: Number(pension.currentValue ?? 0),
      annualContribution: Number(pension.annualContribution ?? 0),
      employerContribution: Number(pension.employerContribution ?? 0),
      dbAnnualPension: Number(pension.dbAnnualPension ?? 0),
      dbLumpSum: Number(pension.dbLumpSum ?? 0),
      dbPensionAge: Number(pension.dbPensionAge ?? 0),
      taxFreePercentage: Number(pension.taxFreePercentage ?? 0),
      chargesPercent: Number(pension.chargesPercent ?? 0),
    });

    const normalizeIsa = (isa: IsaPot): IsaPot => ({
      ...isa,
      id: String(isa.id),
      label: String(isa.label ?? ''),
      isaType: isa.isaType === 'LISA' ? 'LISA' : (isa.isaType === 'CASH_ISA' ? 'CASH_ISA' : 'ISA'),
      currentValue: Number(isa.currentValue ?? 0),
      annualContribution: Number(isa.annualContribution ?? 0),
      chargesPercent: Number(isa.chargesPercent ?? 0),
    });

    const inflationPercent = Number(settings.inflationPercent ?? 2.5);

    return {
      me: {
        currentAge: Number(personal.meCurrentAge),
        retirementAge: Number(personal.meRetirementAge),
        pensions: ((portfolio.mePensions ?? []) as PensionPot[]).map(normalizePension),
        isas: ((portfolio.meIsas ?? []) as IsaPot[]).map(normalizeIsa),
      },
      partner: personal.includePartner
        ? {
            currentAge: Number(personal.partnerCurrentAge),
            retirementAge: Number(personal.partnerRetirementAge),
            pensions: ((portfolio.partnerPensions ?? []) as PensionPot[]).map(normalizePension),
            isas: ((portfolio.partnerIsas ?? []) as IsaPot[]).map(normalizeIsa),
          }
        : undefined,
      properties: ((portfolio.properties ?? []) as PropertyAsset[]).map((p) => ({
        id: String(p.id),
        label: String(p.label ?? 'Property'),
        propertyType: p.propertyType === 'buy-to-let' ? 'buy-to-let' : 'residential',
        currentValue: Math.max(0, Number(p.currentValue ?? 0)),
        mortgageType: p.mortgageType === 'interest-only' ? 'interest-only' : 'repayment',
        mortgageOutstanding: Math.max(0, Number(p.mortgageOutstanding ?? 0)),
        mortgageRatePercent: Math.min(100, Math.max(0, Number(p.mortgageRatePercent ?? 0))),
        mortgageYearsRemaining: Math.min(60, Math.max(0, Math.floor(Number(p.mortgageYearsRemaining ?? 0)))),
        annualRentalIncome:
          p.propertyType === 'buy-to-let' ? Math.max(0, Number(p.annualRentalIncome ?? 0)) : 0,
      })),
      settings: {
        inflationPercent,
        dbPensionIncreasePercent: Number(settings.dbPensionIncreasePercent ?? 0),
        statePensionIncreasePercent: Number(
          settings.statePensionIncreasePercent ?? settings.inflationPercent ?? 2.5,
        ),
        cashIsaPercent: Math.min(100, Math.max(0, Number(settings.cashIsaPercent ?? 2.5))),
        rentalGrowthPercent: Number(settings.rentalGrowthPercent ?? settings.inflationPercent ?? 2.5),
        housePriceGrowthPercent: Number(settings.housePriceGrowthPercent ?? settings.inflationPercent ?? 2.5),
        rentalOwnershipMePercent: Math.min(100, Math.max(0, Number(settings.rentalOwnershipMePercent ?? 100))),
        globalChargesPercent: Number(settings.globalChargesPercent),
        returnScenario: settings.returnScenario as ReturnScenario,
        returnRates: {
          low: Number((settings.returnRates as { low: number }).low),
          medium: Number((settings.returnRates as { medium: number }).medium),
          high: Number((settings.returnRates as { high: number }).high),
        },
        applyPCLSLimit: !!settings.applyPCLSLimit,
        pensionAccessAge: Math.min(75, Math.max(50, Number(settings.pensionAccessAge ?? 57))),
        drawdownPriority:
          settings.drawdownPriority === 'isa-first' ? 'isa-first' : 'pension-first',
        drawdownSplitToMePercent: Math.min(
          100,
          Math.max(0, Number(settings.drawdownSplitToMePercent ?? 50)),
        ),
        drawdownAmountsAreNet: !!settings.drawdownAmountsAreNet,
        taxBands: ((settings.taxBands ?? []) as TaxBand[]).map((b) => ({
          from: Number(b.from),
          rate: Number(b.rate),
        })),
        monteCarloRuns: Math.min(5000, Math.max(100, Number(settings.monteCarloRuns ?? 500))),
        monteCarloVolatilityPercent: Math.min(
          80,
          Math.max(0, Number(settings.monteCarloVolatilityPercent ?? 12)),
        ),
        monteCarloUseSeed: !!settings.monteCarloUseSeed,
        monteCarloSeed: settings.monteCarloUseSeed
          ? Math.max(1, Math.floor(Number(settings.monteCarloSeed ?? 12345)))
          : undefined,
        monteCarloUseWorker: settings.monteCarloUseWorker ?? true,
      } as ProjectionSettings,
      lumpSums,
      futureContributions,
      drawdownSchedule: schedule,
      statePersonAge: Number(personal.statePersonAge),
      statePersonAmount: Number(personal.statePersonAmount),
      statePartnerAge: personal.includePartner ? Number(personal.statePartnerAge) : undefined,
      statePartnerAmount: personal.includePartner ? Number(personal.statePartnerAmount) : undefined,
    };
  }

  private loadFormValue(raw: any): void {
    this.personalGroup.patchValue(raw.personal ?? {}, { emitEvent: false });
    this.settingsGroup.patchValue(raw.settings ?? {}, { emitEvent: false });

    const rawBands: TaxBand[] = raw?.settings?.taxBands ?? this.defaultTaxBands();
    this.replaceArray(
      this.taxBandsArray,
      rawBands,
      (b) => this.createTaxBandGroup({ from: Number(b.from), rate: Number(b.rate) }),
    );

    this.replaceArray(
      this.portfolioGroup.get('mePensions') as FormArray,
      raw?.portfolio?.mePensions ?? [],
      (v) => this.fb.group({
        id: this.fb.control(v.id ?? crypto.randomUUID(), { nonNullable: true }),
        label: this.fb.control(v.label ?? 'Me DC Pension'),
        type: this.fb.control(v.type ?? 'DC'),
        currentValue: this.fb.control(v.currentValue ?? 0),
        annualContribution: this.fb.control(v.annualContribution ?? 0),
        employerContribution: this.fb.control(v.employerContribution ?? 0),
        dbAnnualPension: this.fb.control(v.dbAnnualPension ?? null),
        dbLumpSum: this.fb.control(v.dbLumpSum ?? null),
        dbPensionAge: this.fb.control(v.dbPensionAge ?? null),
        taxFreePercentage: this.fb.control(v.taxFreePercentage ?? 25),
        chargesPercent: this.fb.control(v.chargesPercent ?? 0),
      }),
    );

    this.replaceArray(
      this.portfolioGroup.get('meIsas') as FormArray,
      raw?.portfolio?.meIsas ?? [],
      (v) => this.fb.group({
        id: this.fb.control(v.id ?? crypto.randomUUID(), { nonNullable: true }),
        label: this.fb.control(v.label ?? 'Me Stocks ISA'),
        isaType: this.fb.control(v.isaType === 'LISA' ? 'LISA' : (v.isaType === 'CASH_ISA' ? 'CASH_ISA' : 'ISA')),
        currentValue: this.fb.control(v.currentValue ?? 0),
        annualContribution: this.fb.control(v.annualContribution ?? 0),
        chargesPercent: this.fb.control(v.chargesPercent ?? 0),
      }),
    );

    this.replaceArray(
      this.portfolioGroup.get('partnerPensions') as FormArray,
      raw?.portfolio?.partnerPensions ?? [],
      (v) => this.fb.group({
        id: this.fb.control(v.id ?? crypto.randomUUID(), { nonNullable: true }),
        label: this.fb.control(v.label ?? 'Partner Pension'),
        type: this.fb.control(v.type ?? 'DB'),
        currentValue: this.fb.control(v.currentValue ?? 0),
        annualContribution: this.fb.control(v.annualContribution ?? 0),
        employerContribution: this.fb.control(v.employerContribution ?? 0),
        dbAnnualPension: this.fb.control(v.dbAnnualPension ?? 0),
        dbLumpSum: this.fb.control(v.dbLumpSum ?? 0),
        dbPensionAge: this.fb.control(v.dbPensionAge ?? 60),
        taxFreePercentage: this.fb.control(v.taxFreePercentage ?? 0),
        chargesPercent: this.fb.control(v.chargesPercent ?? 0),
      }),
    );

    this.replaceArray(
      this.portfolioGroup.get('partnerIsas') as FormArray,
      raw?.portfolio?.partnerIsas ?? [],
      (v) => this.fb.group({
        id: this.fb.control(v.id ?? crypto.randomUUID(), { nonNullable: true }),
        label: this.fb.control(v.label ?? 'Partner Stocks ISA'),
        isaType: this.fb.control(v.isaType === 'LISA' ? 'LISA' : (v.isaType === 'CASH_ISA' ? 'CASH_ISA' : 'ISA')),
        currentValue: this.fb.control(v.currentValue ?? 0),
        annualContribution: this.fb.control(v.annualContribution ?? 0),
        chargesPercent: this.fb.control(v.chargesPercent ?? 0),
      }),
    );

    this.replaceArray(
      this.portfolioGroup.get('properties') as FormArray,
      raw?.portfolio?.properties ?? [],
      (v) => {
        const propertyType = v.propertyType === 'buy-to-let' ? 'buy-to-let' : 'residential';
        return this.fb.group({
          id: this.fb.control(v.id ?? crypto.randomUUID(), { nonNullable: true }),
          label: this.fb.control(v.label ?? 'Property', [Validators.required]),
          propertyType: this.fb.control(propertyType, [Validators.required]),
          currentValue: this.fb.control(v.currentValue ?? 300000, [Validators.required, Validators.min(0)]),
          mortgageType: this.fb.control(v.mortgageType === 'interest-only' ? 'interest-only' : 'repayment', [Validators.required]),
          mortgageOutstanding: this.fb.control(v.mortgageOutstanding ?? 0, [Validators.required, Validators.min(0)]),
          mortgageRatePercent: this.fb.control(v.mortgageRatePercent ?? 4, [Validators.required, Validators.min(0), Validators.max(100)]),
          mortgageYearsRemaining: this.fb.control(v.mortgageYearsRemaining ?? 20, [Validators.required, Validators.min(0), Validators.max(60)]),
          annualRentalIncome: this.fb.control(
            {
              value: propertyType === 'buy-to-let' ? v.annualRentalIncome ?? 0 : 0,
              disabled: propertyType !== 'buy-to-let',
            },
            [Validators.required, Validators.min(0)],
          ),
        });
      },
    );

    this.replaceArray(
      this.drawdownGroup.get('lumpSums') as FormArray,
      raw?.drawdown?.lumpSums ?? [],
      (v) =>
        this.fb.group({
          id: this.fb.control(v.id ?? crypto.randomUUID(), { nonNullable: true }),
          label: this.fb.control(v.label ?? 'One-off expense'),
          age: this.fb.control(v.age ?? 65),
          amount: this.fb.control(v.amount ?? 0),
          fromSource: this.fb.control(v.fromSource ?? 'any'),
          lisaUseForFirstHome: this.fb.control(!!v.lisaUseForFirstHome),
          lisaFirstTimeBuyer: this.fb.control(!!v.lisaFirstTimeBuyer),
          lisaPropertyPrice: this.fb.control(v.lisaPropertyPrice ?? 0),
          lisaMonthsOpen: this.fb.control(v.lisaMonthsOpen ?? 0),
        }),
    );

    this.replaceArray(
      this.drawdownGroup.get('futureContributions') as FormArray,
      raw?.drawdown?.futureContributions ?? [],
      (v) =>
        this.fb.group({
          id: this.fb.control(v.id ?? crypto.randomUUID(), { nonNullable: true }),
          label: this.fb.control(v.label ?? 'One-off contribution'),
          age: this.fb.control(v.age ?? 65),
          amount: this.fb.control(v.amount ?? 0),
          toSource: this.fb.control(v.toSource ?? 'any'),
        }),
    );

    this.replaceArray(
      this.drawdownGroup.get('drawdownSchedule') as FormArray,
      raw?.drawdown?.drawdownSchedule ?? [],
      (v) =>
        this.fb.group({
          age: this.fb.control(v.age ?? 67),
          annualAmount: this.fb.control(v.annualAmount ?? 30000),
          fromSource: this.fb.control(v.fromSource ?? 'proportional'),
        }),
    );

    this.refreshSourceOptions();
  }

  private replaceArray(arr: FormArray, values: any[], mapFn: (value: any) => FormGroup): void {
    while (arr.length) {
      arr.removeAt(0, { emitEvent: false });
    }

    for (const value of values) {
      arr.push(mapFn(value), { emitEvent: false });
    }

    if (arr.length === 0) {
      if (arr === this.drawdownGroup.get('drawdownSchedule')) {
        arr.push(
          this.fb.group({
            age: this.fb.control(67),
            annualAmount: this.fb.control(30000),
            fromSource: this.fb.control('proportional'),
          }),
          { emitEvent: false },
        );
      }
    }
  }

  private persistInputs(): void {
    try {
      localStorage.setItem(AppShellComponent.STORAGE_KEY, JSON.stringify(this.form.getRawValue()));
    } catch {
      // Ignore storage failures (private mode/quota/security restrictions).
    }
  }

  private loadFromLocalStorage(): void {
    try {
      const raw = localStorage.getItem(AppShellComponent.STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      this.loadFormValue(parsed);
    } catch {
      // Ignore invalid or inaccessible storage payloads.
    }
  }
}
