import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import * as echarts from 'echarts/core';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { BarChart, LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { MonteCarloResult } from '../../../models/pension.models';

echarts.use([GridComponent, LegendComponent, TooltipComponent, LineChart, BarChart, CanvasRenderer]);

type PercentileView = 'p10-90' | 'p5-95';

@Component({
  selector: 'app-forecast-monte-carlo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideEchartsCore({ echarts })],
  imports: [CommonModule, NgxEchartsDirective, MatButtonToggleModule],
  templateUrl: './forecast-monte-carlo.component.html',
  styleUrl: './forecast-monte-carlo.component.scss',
})
export class ForecastMonteCarloComponent {
  readonly result = input.required<MonteCarloResult>();
  readonly percentileView = signal<PercentileView>('p10-90');

  readonly percentileSummaryLabel = computed(() =>
    this.percentileView() === 'p10-90' ? 'P10 / P50 / P90' : 'P5 / P25 / P50 / P75 / P95',
  );

  readonly percentileSummaryValues = computed(() => {
    const result = this.result();
    if (this.percentileView() === 'p10-90') {
      return [result.p10FinalBalance, result.p50FinalBalance, result.p90FinalBalance]
        .map((v) => this.formatCurrency(v))
        .join(' / ');
    }

    return [
      result.p5FinalBalance,
      result.p25FinalBalance,
      result.p50FinalBalance,
      result.p75FinalBalance,
      result.p95FinalBalance,
    ]
      .map((v) => this.formatCurrency(v))
      .join(' / ');
  });

  readonly percentileThresholdHint = computed(() =>
    this.percentileView() === 'p10-90'
      ? 'Percentiles are thresholds: P90 means 90% of runs finish at or below that value (10% above).'
      : 'Percentiles are thresholds: P75 means 75% of runs finish at or below that value (25% above).',
  );

  readonly fanChartOptions = computed(() => {
    const result = this.result();
    const years = result.years;
    if (!years.length) {
      return {};
    }

    const isNarrow = this.percentileView() === 'p10-90';

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const points = Array.isArray(params) ? params : [params];
          const index = points[0]?.dataIndex ?? 0;
          const row = years[index];
          if (!row) {
            return '';
          }

          return [
            `<strong>${row.year} / Age ${row.meAge}</strong>`,
            isNarrow ? `P10: ${this.formatCurrency(row.p10)}` : `P5: ${this.formatCurrency(row.p5)}`,
            isNarrow ? `P50: ${this.formatCurrency(row.p50)}` : `P25: ${this.formatCurrency(row.p25)}`,
            isNarrow ? `P90: ${this.formatCurrency(row.p90)}` : `P50: ${this.formatCurrency(row.p50)}`,
            isNarrow ? '' : `P75: ${this.formatCurrency(row.p75)}`,
            isNarrow ? '' : `P95: ${this.formatCurrency(row.p95)}`,
            `Failure probability by this age: ${this.formatPercent(row.failureRate)}`,
          ].filter(Boolean).join('<br/>');
        },
      },
      legend: { top: 0 },
      grid: { left: 58, right: 24, top: 56, bottom: 50 },
      xAxis: {
        type: 'category',
        data: years.map((row) => `${row.year} / ${row.meAge}`),
        axisLabel: { rotate: 35 },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value: number) => `£${Math.round(value).toLocaleString()}`,
        },
      },
      series: [
        {
          name: isNarrow ? 'P10 (downside)' : 'P5 (tail downside)',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#b91c1c', width: 2, type: 'dashed' },
          data: years.map((row) => Math.round(isNarrow ? row.p10 : row.p5)),
        },
        {
          name: isNarrow ? 'P50 (median)' : 'P25',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#2563eb', width: 2.2 },
          data: years.map((row) => Math.round(isNarrow ? row.p50 : row.p25)),
        },
        {
          name: isNarrow ? 'P90 (upside)' : 'P50 (median)',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#1d4ed8', width: 2.6 },
          data: years.map((row) => Math.round(isNarrow ? row.p90 : row.p50)),
        },
        ...(!isNarrow
          ? [
              {
                name: 'P75',
                type: 'line',
                smooth: true,
                symbol: 'none',
                lineStyle: { color: '#059669', width: 2.2 },
                data: years.map((row) => Math.round(row.p75)),
              },
              {
                name: 'P95 (tail upside)',
                type: 'line',
                smooth: true,
                symbol: 'none',
                lineStyle: { color: '#047857', width: 2, type: 'dashed' },
                data: years.map((row) => Math.round(row.p95)),
              },
            ]
          : []),
      ],
    };
  });

  readonly histogramOptions = computed(() => {
    const balances = this.result().finalBalances ?? [];
    if (!balances.length) {
      return {};
    }

    const bins = this.histogram(balances, 14);

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const point = Array.isArray(params) ? params[0] : params;
          const i = point?.dataIndex ?? 0;
          const bin = bins[i];
          if (!bin) {
            return '';
          }
          return [
            `<strong>${bin.label}</strong>`,
            `Runs: ${bin.count}`,
          ].join('<br/>');
        },
      },
      grid: { left: 52, right: 24, top: 24, bottom: 54 },
      xAxis: {
        type: 'category',
        data: bins.map((b) => b.label),
        axisLabel: { rotate: 30 },
      },
      yAxis: {
        type: 'value',
        name: 'Runs',
      },
      series: [
        {
          name: 'Final Balance Distribution',
          type: 'bar',
          data: bins.map((b) => b.count),
          itemStyle: { color: '#3b82f6' },
          barMaxWidth: 28,
        },
      ],
    };
  });

  private formatCurrency(value: number): string {
    return `£${Math.round(value).toLocaleString()}`;
  }

  private formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  private histogram(values: number[], bins: number): Array<{ label: string; count: number }> {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      return [{ label: `${this.formatCurrency(min)}`, count: values.length }];
    }

    const bucketSize = (max - min) / bins;
    const counts = new Array(bins).fill(0);

    for (const value of values) {
      const index = Math.min(bins - 1, Math.max(0, Math.floor((value - min) / bucketSize)));
      counts[index] += 1;
    }

    return counts.map((count, i) => {
      const from = min + bucketSize * i;
      const to = min + bucketSize * (i + 1);
      return {
        label: `${this.formatCurrency(from)} - ${this.formatCurrency(to)}`,
        count,
      };
    });
  }
}
