import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { ForecastYear } from '../../../models/pension.models';

@Component({
  selector: 'app-forecast-table',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatFormFieldModule, MatSelectModule, MatButtonModule, CurrencyPipe],
  templateUrl: './forecast-table.component.html',
  styleUrl: './forecast-table.component.scss',
})
export class ForecastTableComponent {
  readonly forecast = input.required<ForecastYear[]>();
  readonly meRetirementAge = input.required<number>();
  readonly partnerRetirementAge = input<number | undefined>(undefined);

  readonly displayedColumns = [
    'year',
    'meAge',
    'partnerAge',
    'totalPotValue',
    'totalPropertyValue',
    'totalMortgageRemaining',
    'totalPropertyEquity',
    'rentalIncome',
    'propertyGrowth',
    'mortgagePrincipalRepaid',
    'dbIncome',
    'stateIncome',
    'drawdownTaken',
    'drawdownFromPension',
    'drawdownFromIsa',
    'drawdownFromCashIsa',
    'drawdownFromLisa',
    'futureContributionsAdded',
    'lumpSumsTaken',
    'lumpSumsFromPension',
    'lumpSumsFromIsa',
    'lumpSumsFromCashIsa',
    'lumpSumsFromDbPension',
    'lumpSumsFromLisa',
    'pclsConsumedThisYear',
    'meIncomeTax',
    'partnerIncomeTax',
    'incomeTax',
    'netIncome',
    'investmentGrowth',
    'closingTotalValue',
  ];

  readonly pclsColumns = [
    'pot',
    'pclsWithdrawn',
    'remainingTaxFree',
    'crystallised',
  ];

  private readonly csvColumnHeaders: Record<string, string> = {
    year: 'Year',
    meAge: 'My Age',
    partnerAge: 'Partner Age',
    totalPotValue: 'Total Pot Value',
    totalPropertyValue: 'Total Property Value',
    totalMortgageRemaining: 'Mortgage Remaining',
    totalPropertyEquity: 'Property Equity',
    rentalIncome: 'Rental Income',
    propertyGrowth: 'House Price Increase',
    mortgagePrincipalRepaid: 'Mortgage Principal Repaid',
    dbIncome: 'DB Income',
    stateIncome: 'State Pension',
    drawdownTaken: 'Drawdown Taken',
    drawdownFromPension: 'Drawdown From Pensions',
    drawdownFromIsa: 'Drawdown From Stocks ISA',
    drawdownFromCashIsa: 'Drawdown From Cash ISA',
    drawdownFromLisa: 'Drawdown From LISA',
    futureContributionsAdded: 'Additional Contributions',
    lumpSumsTaken: 'Lump Sums',
    lumpSumsFromPension: 'Lump Sums From Pensions',
    lumpSumsFromIsa: 'Lump Sums From Stocks ISA',
    lumpSumsFromCashIsa: 'Lump Sums From Cash ISA',
    lumpSumsFromDbPension: 'Lump Sums From DB Pension',
    lumpSumsFromLisa: 'Lump Sums From LISA',
    pclsConsumedThisYear: 'Tax-Free Cash Used This Year',
    meIncomeTax: 'My Tax',
    partnerIncomeTax: 'Partner Tax',
    incomeTax: 'Household Tax',
    netIncome: 'Net Income',
    investmentGrowth: 'Investment Growth',
    closingTotalValue: 'Closing Value',
  };

  readonly selectedPclsYear = signal<number | null>(null);

  readonly pclsYearOptions = computed(() => this.forecast().map((row) => row.year));

  readonly selectedPclsYearRow = computed(() => {
    const rows = this.forecast();
    if (!rows.length) {
      return null;
    }

    const selectedYear = this.selectedPclsYear();
    if (selectedYear === null) {
      return rows[rows.length - 1];
    }

    return rows.find((row) => row.year === selectedYear) ?? rows[rows.length - 1];
  });

  readonly pclsRows = computed(() => {
    const selected = this.selectedPclsYearRow();
    if (!selected) {
      return [] as Array<{
        pot: string;
        pclsWithdrawn: number;
        remainingTaxFree: number;
        crystallised: number;
      }>;
    }

    return Object.keys(selected.pclsWithdrawnByPot)
      .map((potId) => ({
        pot: selected.potLabels[potId] ?? potId,
        pclsWithdrawn: selected.pclsWithdrawnByPot[potId] ?? 0,
        remainingTaxFree: selected.remainingTaxFreeByPot[potId] ?? 0,
        crystallised: selected.crystallisedByPot[potId] ?? 0,
      }))
      .sort((a, b) => b.remainingTaxFree - a.remainingTaxFree);
  });

  onPclsYearChange(year: number): void {
    this.selectedPclsYear.set(year);
  }

  readonly summary = computed(() => {
    const rows = this.forecast();
    const firstExhaustion = rows.find((r) => r.fundsExhausted);
    const totalDb = rows.reduce((sum, row) => sum + row.dbIncome, 0);
    const totalState = rows.reduce((sum, row) => sum + row.stateIncome, 0);
    const totalTax = rows.reduce((sum, row) => sum + row.incomeTax, 0);

    return {
      exhaustionText: firstExhaustion
        ? `Pots exhausted in ${firstExhaustion.year} (age ${firstExhaustion.meAge})`
        : 'Funds last beyond age 100',
      totalDb,
      totalState,
      totalTax,
      firstExhaustionYear: firstExhaustion?.year,
    };
  });

  rowClass(row: ForecastYear): string {
    const partnerRetAge = this.partnerRetirementAge();
    const meRetired = row.meAge >= this.meRetirementAge();
    const partnerRetired =
      row.partnerAge !== undefined && partnerRetAge !== undefined
        ? row.partnerAge >= partnerRetAge
        : false;

    if (row.year === this.summary().firstExhaustionYear) {
      return 'exhausted';
    }

    if (!meRetired && !partnerRetired) {
      return 'pre-retirement';
    }

    if ((meRetired && !partnerRetired) || (!meRetired && partnerRetired)) {
      return 'single-retired';
    }

    return 'default-row';
  }

  downloadYearlyTableCsv(): void {
    const rows = this.forecast();
    if (!rows.length) {
      return;
    }

    const headers = this.displayedColumns.map(
      (column) => this.csvColumnHeaders[column] ?? column,
    );

    const csvLines = [
      headers.map((value) => this.escapeCsvValue(value)).join(','),
      ...rows.map((row) => this.displayedColumns
        .map((column) => this.escapeCsvValue(this.getCsvCellValue(row, column)))
        .join(',')),
    ];

    const csv = csvLines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'year-by-year-forecast.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  private getCsvCellValue(row: ForecastYear, column: string): string | number {
    const value = row[column as keyof ForecastYear];
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'number') {
      return value;
    }

    return String(value);
  }

  private escapeCsvValue(value: string | number): string {
    const text = String(value);
    if (!/[",\r\n]/.test(text)) {
      return text;
    }

    return `"${text.replace(/"/g, '""')}"`;
  }
}
