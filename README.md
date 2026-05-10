# RetirementPlanner

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.5.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
# Angular Pension Retirement Forecast Tool

Standalone Angular application (v20+) for projecting retirement outcomes for "Me" and an optional partner across DC pensions, partner DB pensions, and ISAs.

## Setup

```bash
npm install
```

## Run

```bash
ng serve
```

Open `http://localhost:4200`.

## Build

```bash
ng build
```

## Key Features

- Standalone Angular architecture with signals and `inject()`
- Angular Material stepper workflow: Personal, Portfolio, Projection Settings, Drawdown Plan, Results
- Reactive forms for all inputs with validation
- Forecast engine in-browser (no backend)
- ECharts stacked area visualization via `ngx-echarts`
- Year-by-year forecast table with exhaustion highlighting
- Auto-recalculate on input change (500ms debounce) and manual recalculate button
- JSON export/import of input state

## Calculation Model Summary

- Projects from current age to age 100 (Me), year by year
- Pre-retirement: applies annual contributions and net growth (`returnRate - charges`)
- Retirement event handling:
	- DC pots apply tax-free cash percentage (with optional simplified HMRC cap)
	- Partner DB annual pension starts at partner retirement
	- Partner DB lump sum is moved into a cash ISA pot
- Post-retirement:
	- Drawdown schedule is linearly interpolated by age
	- Drawdown requirement is inflation-adjusted from today's money
	- Guaranteed income (DB + state pension) offsets drawdown need first
	- Any deficit is withdrawn from DC then ISA balances (largest first, or specific source)
	- Lump sums are applied at configured ages
- `fundsExhausted` is flagged once all DC/ISA balances are depleted
- Projection continues after exhaustion so DB/state income remains visible

## Notes

- Values are projected in nominal money.
- Drawdown is shown gross and potentially taxable.
- This app does not perform personal tax calculations.
