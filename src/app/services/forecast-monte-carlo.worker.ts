/// <reference lib="webworker" />

import { ForecastService } from './forecast.service';
import { ForecastInputs, MonteCarloResult } from '../models/pension.models';

interface WorkerRequest {
  id: number;
  inputs: ForecastInputs;
}

interface WorkerResponse {
  id: number;
  result: MonteCarloResult;
}

type RandomFn = () => number;

const forecastService = new ForecastService();

addEventListener('message', ({ data }: MessageEvent<WorkerRequest>) => {
  if (!data?.inputs) {
    return;
  }

  const result = runMonteCarlo(data.inputs);
  postMessage({ id: data.id, result } satisfies WorkerResponse);
});

function runMonteCarlo(inputs: ForecastInputs): MonteCarloResult {
  const runs = Math.max(100, Math.min(5000, Math.round(inputs.settings.monteCarloRuns || 500)));
  const volatility = Math.max(0, Math.min(80, inputs.settings.monteCarloVolatilityPercent || 12));
  const useSeed = !!inputs.settings.monteCarloUseSeed;
  const seed = useSeed
    ? Math.max(1, Math.min(2147483646, Math.floor(inputs.settings.monteCarloSeed ?? 12345)))
    : undefined;
  const random = useSeed && seed !== undefined ? seededRandom(seed) : () => Math.random();

  const templateRows = forecastService.calculateForecast(inputs);
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
    const runRows = forecastService.calculateForecast(inputs, {
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
    modeUsed: 'worker',
    successProbability: successCount / runs,
    p5FinalBalance: percentile(finalBalances, 0.05),
    p10FinalBalance: percentile(finalBalances, 0.1),
    p25FinalBalance: percentile(finalBalances, 0.25),
    p50FinalBalance: percentile(finalBalances, 0.5),
    p75FinalBalance: percentile(finalBalances, 0.75),
    p90FinalBalance: percentile(finalBalances, 0.9),
    p95FinalBalance: percentile(finalBalances, 0.95),
    medianFailureAge: failureAges.length ? percentile(failureAges, 0.5) : undefined,
    finalBalances,
    years: years.map((year) => ({
      year: year.year,
      meAge: year.meAge,
      partnerAge: year.partnerAge,
      p5: percentile(year.balances, 0.05),
      p10: percentile(year.balances, 0.1),
      p25: percentile(year.balances, 0.25),
      p50: percentile(year.balances, 0.5),
      p75: percentile(year.balances, 0.75),
      p90: percentile(year.balances, 0.9),
      p95: percentile(year.balances, 0.95),
      failureRate: year.failures / runs,
    })),
  };
}

function seededRandom(seed: number): RandomFn {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(values: number[], q: number): number {
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
