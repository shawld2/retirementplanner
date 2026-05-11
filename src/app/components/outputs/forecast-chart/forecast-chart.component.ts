import { CommonModule } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { DrawdownPriority, ForecastYear, ReturnScenario } from '../../../models/pension.models';

echarts.use([GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, LineChart, CanvasRenderer]);

@Component({
  selector: 'app-forecast-chart',
  standalone: true,
  providers: [provideEchartsCore({ echarts })],
  imports: [CommonModule, NgxEchartsDirective, MatButtonToggleModule, MatCheckboxModule],
  templateUrl: './forecast-chart.component.html',
  styleUrl: './forecast-chart.component.scss',
})
export class ForecastChartComponent {
  readonly forecast = input.required<ForecastYear[]>();
  readonly selectedScenario = input.required<ReturnScenario>();
  readonly selectedDrawdownPriority = input.required<DrawdownPriority>();
  readonly meRetirementAge = input.required<number>();
  readonly partnerRetirementAge = input<number | undefined>(undefined);
  readonly statePersonAge = input.required<number>();
  readonly statePartnerAge = input<number | undefined>(undefined);

  readonly scenarioChanged = output<ReturnScenario>();
  readonly drawdownPriorityChanged = output<DrawdownPriority>();
  readonly showOverlayLines = signal(true);

  readonly options = computed(() => {
    const rows = this.forecast();
    if (!rows.length) {
      return {};
    }

    const xAxisLabels = rows.map((r) => `${r.year} / ${r.meAge}`);
    const firstPotMap = rows[0].potBalances ?? {};
    const firstPotLabels = rows[0].potLabels ?? {};
    const potIds = Object.keys(firstPotMap);

    const areaSeries = potIds.map((potId, index) => ({
      name: firstPotLabels[potId] || `Pot ${index + 1}`,
      type: 'line',
      stack: 'pots',
      smooth: true,
      symbol: 'none',
      areaStyle: { opacity: 0.6 },
      data: rows.map((r) => Number((r.potBalances[potId] ?? 0).toFixed(0))),
    }));

    const drawdownSeries = {
      name: 'Drawdown Requirement',
      type: 'line',
      smooth: true,
      symbol: 'none',
      yAxisIndex: 0,
      lineStyle: { width: 2, type: 'solid', color: '#1f2937' },
      data: rows.map((r) => Number(r.drawdownRequired.toFixed(0))),
      markLine: {
        symbol: ['none', 'none'],
        lineStyle: { type: 'dashed', width: 1.5 },
        data: this.markerLines(rows),
      },
    };

    const drawdownTakenSeries = {
      name: 'Drawdown Taken',
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2, color: '#0f766e' },
      data: rows.map((r) => Number(r.drawdownTaken.toFixed(0))),
    };

    const lumpSumsSeries = {
      name: 'Lump Sums Taken',
      type: 'line',
      smooth: false,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { width: 2, color: '#ea580c' },
      data: rows.map((r) => Number(r.lumpSumsTaken.toFixed(0))),
    };

    const taxableSeries = {
      name: 'Taxable Withdrawals',
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2, type: 'dashed', color: '#b91c1c' },
      data: rows.map((r) => Number(r.taxableWithdrawals.toFixed(0))),
    };

    const rentalIncomeSeries = {
      name: 'Rental Income',
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2, type: 'dashed', color: '#7c3aed' },
      data: rows.map((r) => Number(r.rentalIncome.toFixed(0))),
    };

    const propertyValueSeries = {
      name: 'Property Value',
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2, color: '#be123c' },
      data: rows.map((r) => Number(r.totalPropertyValue.toFixed(0))),
    };

    const mortgageRemainingSeries = {
      name: 'Mortgage Remaining',
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2, type: 'dotted', color: '#0369a1' },
      data: rows.map((r) => Number(r.totalMortgageRemaining.toFixed(0))),
    };

    const incomeTaxSeries = {
      name: 'Income Tax Paid',
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2, type: 'dotted', color: '#92400e' },
      data: rows.map((r) => Number(r.incomeTax.toFixed(0))),
    };

    const potSeriesNames = new Set(areaSeries.map((s) => s.name));

    return {
      tooltip: {
        trigger: 'axis',
        appendToBody: true,
        className: 'forecast-tooltip',
        formatter: (params: any) => {
          const points = Array.isArray(params) ? params : [params];
          if (!points.length) {
            return '';
          }

          const index = points[0].dataIndex as number;
          const row = rows[index];
          if (!row) {
            return '';
          }

          const totalPots = Object.values(row.potBalances).reduce((sum, value) => sum + value, 0);
          const lines: string[] = [];
          lines.push(`<strong>${row.year} / Age ${row.meAge}</strong>`);
          lines.push(`Total Pots: <strong>${this.formatCurrency(totalPots)}</strong>`);
          lines.push(`DB Pension Income: ${this.formatCurrency(row.dbIncome)}`);
          lines.push(`State Pension Income: ${this.formatCurrency(row.stateIncome)}`);
          lines.push(`Rental Income: ${this.formatCurrency(row.rentalIncome)}`);
          lines.push(`Future Contributions Added: ${this.formatCurrency(row.futureContributionsAdded)}`);
          lines.push(`Drawdown Taken: ${this.formatCurrency(row.drawdownTaken)}`);
          lines.push(`Lump Sums: ${this.formatCurrency(row.lumpSumsTaken)}`);
          lines.push(`  from Pensions: ${this.formatCurrency(row.lumpSumsFromPension)}`);
          lines.push(`  from ISAs: ${this.formatCurrency(row.lumpSumsFromIsa)}`);
          lines.push(`PCLS Consumed This Year: ${this.formatCurrency(row.pclsConsumedThisYear)}`);
          lines.push(`Taxable Withdrawals: ${this.formatCurrency(row.taxableWithdrawals)}`);
          lines.push(`My Taxable Income: ${this.formatCurrency(row.meTaxableIncome)}`);
          lines.push(`Partner Taxable Income: ${this.formatCurrency(row.partnerTaxableIncome)}`);
          lines.push(`My Tax: ${this.formatCurrency(row.meIncomeTax)}`);
          lines.push(`Partner Tax: ${this.formatCurrency(row.partnerIncomeTax)}`);
          lines.push(`Household Tax: ${this.formatCurrency(row.incomeTax)}`);
          lines.push(`Net Income: ${this.formatCurrency(row.netIncome)}`);
          lines.push(`Total Income: <strong>${this.formatCurrency(row.totalIncome)}</strong>`);
          lines.push('');
          lines.push('<strong>Tax Attribution</strong>');
          lines.push(`Gross From Pots: ${this.formatCurrency(row.grossFromPots)}`);
          lines.push(`Tax On Guaranteed Income: ${this.formatCurrency(row.taxOnGuaranteedIncome)}`);
          lines.push(`Tax On Pot Withdrawals: ${this.formatCurrency(row.taxOnPotWithdrawals)}`);
          lines.push(
            `Effective Tax Rate On Pot Gross: ${this.formatPercent(
              row.grossFromPots > 0 ? row.taxOnPotWithdrawals / row.grossFromPots : 0,
            )}`,
          );
          lines.push(`Property Value: ${this.formatCurrency(row.totalPropertyValue)}`);
          lines.push(`Mortgage Remaining: ${this.formatCurrency(row.totalMortgageRemaining)}`);
          lines.push(`Property Equity: ${this.formatCurrency(row.totalPropertyEquity)}`);
          lines.push(`House Price Increase: ${this.formatCurrency(row.propertyGrowth)}`);
          lines.push(`Mortgage Principal Repaid: ${this.formatCurrency(row.mortgagePrincipalRepaid)}`);
          lines.push('');

          for (const point of points) {
            if (!potSeriesNames.has(point.seriesName)) {
              continue;
            }
            lines.push(`${point.marker}${point.seriesName}: ${this.formatCurrency(Number(point.value))}`);
          }

          return lines.join('<br/>');
        },
      },
      legend: { top: 0 },
      grid: { left: 56, right: 24, top: 56, bottom: 48 },
      xAxis: {
        type: 'category',
        data: xAxisLabels,
        axisLabel: { rotate: 35 },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (v: number) => `£${Math.round(v).toLocaleString()}`,
        },
      },
      series: this.showOverlayLines()
        ? [
            ...areaSeries,
            drawdownSeries,
            drawdownTakenSeries,
            lumpSumsSeries,
            taxableSeries,
            rentalIncomeSeries,
            propertyValueSeries,
            mortgageRemainingSeries,
            incomeTaxSeries,
          ]
        : [...areaSeries],
    };
  });

  private formatCurrency(value: number): string {
    return `£${Math.round(value).toLocaleString()}`;
  }

  private formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  private markerLines(rows: ForecastYear[]): Array<{ xAxis: number; name: string; lineStyle?: unknown }> {
    const markers: Array<{ xAxis: number; name: string; lineStyle?: unknown }> = [];

    const meRetIndex = rows.findIndex((r) => r.meAge === this.meRetirementAge());
    if (meRetIndex >= 0) {
      markers.push({ xAxis: meRetIndex, name: 'My Retirement' });
    }

    if (this.partnerRetirementAge() !== undefined) {
      const pIndex = rows.findIndex((r) => r.partnerAge === this.partnerRetirementAge());
      if (pIndex >= 0) {
        markers.push({ xAxis: pIndex, name: 'Partner Retirement' });
      }
    }

    const meStateIndex = rows.findIndex((r) => r.meAge === this.statePersonAge());
    if (meStateIndex >= 0) {
      markers.push({ xAxis: meStateIndex, name: 'My State Pension' });
    }

    if (this.statePartnerAge() !== undefined) {
      const statePartnerIndex = rows.findIndex((r) => r.partnerAge === this.statePartnerAge());
      if (statePartnerIndex >= 0) {
        markers.push({ xAxis: statePartnerIndex, name: 'Partner State Pension' });
      }
    }

    const exhaustedIndex = rows.findIndex((r) => r.fundsExhausted);
    if (exhaustedIndex >= 0) {
      markers.push({
        xAxis: exhaustedIndex,
        name: 'Funds Exhausted',
        lineStyle: { type: 'dotted', color: '#dc2626' },
      });
    }

    return markers;
  }
}
