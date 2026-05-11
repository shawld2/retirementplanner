export type ReturnScenario = 'low' | 'medium' | 'high';
export type DrawdownPriority = 'pension-first' | 'isa-first';
export type PropertyType = 'residential' | 'buy-to-let';
export type MortgageType = 'repayment' | 'interest-only';

/** A marginal income-tax band. `from` is the lower bound (inclusive). */
export interface TaxBand {
  from: number;
  rate: number; // percentage, e.g. 20
}

export interface PersonInputs {
  currentAge: number;
  retirementAge: number;
  pensions: PensionPot[];
  isas: IsaPot[];
}

export interface PensionPot {
  id: string;
  label: string;
  type: 'DC' | 'DB';
  currentValue?: number;
  annualContribution?: number;
  employerContribution?: number;
  dbAnnualPension?: number;
  dbLumpSum?: number;
  dbPensionAge?: number;
  taxFreePercentage: number;
  chargesPercent?: number;
}

export interface IsaPot {
  id: string;
  label: string;
  isaType: 'ISA' | 'LISA' | 'CASH_ISA';
  currentValue: number;
  annualContribution: number;
  chargesPercent?: number;
}

export interface PropertyAsset {
  id: string;
  label: string;
  propertyType: PropertyType;
  currentValue: number;
  mortgageType: MortgageType;
  mortgageOutstanding: number;
  mortgageRatePercent: number;
  mortgageYearsRemaining: number;
  annualRentalIncome: number;
}

export interface ProjectionSettings {
  inflationPercent: number;
  dbPensionIncreasePercent: number;
  statePensionIncreasePercent: number;
  cashIsaPercent: number;
  rentalGrowthPercent: number;
  housePriceGrowthPercent: number;
  rentalOwnershipMePercent: number;
  globalChargesPercent: number;
  returnScenario: ReturnScenario;
  returnRates: { low: number; medium: number; high: number };
  applyPCLSLimit: boolean;
  drawdownPriority: DrawdownPriority;
  /** Percentage of required drawdown allocated to me when partner is included (0-100). */
  drawdownSplitToMePercent: number;
  /** If true, drawdown schedule amounts are treated as desired net (after-tax) income from pots. */
  drawdownAmountsAreNet: boolean;
  /** Marginal income-tax bands used for grossing-up and reporting. Sorted ascending by `from`. */
  taxBands: TaxBand[];
  /** Number of Monte Carlo simulation runs. */
  monteCarloRuns: number;
  /** Annual return volatility (standard deviation, percent). */
  monteCarloVolatilityPercent: number;
  /** Use a fixed RNG seed for reproducible Monte Carlo runs. */
  monteCarloUseSeed: boolean;
  /** Optional seed value for reproducible Monte Carlo runs. */
  monteCarloSeed?: number;
  /** Request background execution mode for Monte Carlo where available. */
  monteCarloUseWorker: boolean;
}

export interface MonteCarloYear {
  year: number;
  meAge: number;
  partnerAge?: number;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  failureRate: number;
}

export interface MonteCarloResult {
  runs: number;
  seedUsed?: number;
  workerRequested: boolean;
  modeUsed: 'main-thread' | 'worker';
  successProbability: number;
  p5FinalBalance: number;
  p10FinalBalance: number;
  p25FinalBalance: number;
  p50FinalBalance: number;
  p75FinalBalance: number;
  p90FinalBalance: number;
  p95FinalBalance: number;
  medianFailureAge?: number;
  finalBalances: number[];
  years: MonteCarloYear[];
}

export interface LumpSumEvent {
  id: string;
  label: string;
  age: number;
  amount: number;
  fromSource: string;
  lisaUseForFirstHome?: boolean;
  lisaFirstTimeBuyer?: boolean;
  lisaPropertyPrice?: number;
  lisaMonthsOpen?: number;
  // Deprecated: taxability is now inferred from actual source withdrawals.
  taxable?: boolean;
}

export interface DrawdownYear {
  age: number;
  annualAmount: number;
  fromSource: string;
}

export interface FutureContributionEvent {
  id: string;
  label: string;
  age: number;
  amount: number;
  toSource: string;
}

export interface ForecastInputs {
  me: PersonInputs;
  partner?: PersonInputs;
  properties: PropertyAsset[];
  settings: ProjectionSettings;
  lumpSums: LumpSumEvent[];
  futureContributions: FutureContributionEvent[];
  drawdownSchedule: DrawdownYear[];
  statePersonAge: number;
  statePersonAmount: number;
  statePartnerAge?: number;
  statePartnerAmount?: number;
}

export interface ForecastYear {
  year: number;
  meAge: number;
  partnerAge?: number;
  potBalances: Record<string, number>;
  potLabels: Record<string, string>;
  pclsWithdrawnByPot: Record<string, number>;
  remainingTaxFreeByPot: Record<string, number>;
  crystallisedByPot: Record<string, number>;
  totalPotValue: number;
  totalPropertyValue: number;
  totalMortgageRemaining: number;
  totalPropertyEquity: number;
  rentalIncome: number;
  propertyGrowth: number;
  mortgagePrincipalRepaid: number;
  closingPropertyValue: number;
  closingMortgageRemaining: number;
  dbIncome: number;
  stateIncome: number;
  drawdownRequired: number;
  drawdownTaken: number;
  drawdownFromPension: number;
  drawdownFromIsa: number;
  drawdownFromCashIsa: number;
  drawdownFromLisa: number;
  drawdownTaxable: number;
  futureContributionsAdded: number;
  lumpSumsTaken: number;
  lumpSumsFromPension: number;
  lumpSumsFromIsa: number;
  lumpSumsFromCashIsa: number;
  lumpSumsFromLisa: number;
  lumpSumsTaxable: number;
  pclsConsumedThisYear: number;
  taxableWithdrawals: number;
  totalIncome: number;
  incomeTax: number;
  meIncomeTax: number;
  partnerIncomeTax: number;
  meTaxableIncome: number;
  partnerTaxableIncome: number;
  taxOnGuaranteedIncome: number;
  taxOnPotWithdrawals: number;
  grossFromPots: number;
  netIncome: number;
  investmentGrowth: number;
  inflationFactor: number;
  closingTotalValue: number;
  fundsExhausted: boolean;
  notes: string[];
}
