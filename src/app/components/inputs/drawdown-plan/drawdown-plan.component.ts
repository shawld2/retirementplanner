import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/custom-select/custom-select.component';
import { CustomInputComponent } from '../../shared/custom-input/custom-input.component';

@Component({
  selector: 'app-drawdown-plan',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    CustomInputComponent,
    CustomSelectComponent,
  ],
  templateUrl: './drawdown-plan.component.html',
  styleUrl: './drawdown-plan.component.scss',
})
export class DrawdownPlanComponent {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly form = input.required<FormGroup>();
  readonly sourceOptions = input.required<Array<{ id: string; label: string }>>();
  readonly lumpSumSourceOptions = computed<SelectOption[]>(() => [
    { value: 'any', label: 'Any (largest first)' },
    ...this.sourceOptions().map((source) => ({ value: source.id, label: source.label })),
  ]);
  readonly futureContributionTargetOptions = computed<SelectOption[]>(() => [
    { value: 'any', label: 'Any (largest eligible)' },
    ...this.sourceOptions().map((source) => ({ value: source.id, label: source.label })),
  ]);
  readonly drawdownSourceOptions = computed<SelectOption[]>(() => [
    { value: 'proportional', label: 'Proportional across eligible pots' },
    ...this.sourceOptions().map((source) => ({ value: source.id, label: source.label })),
  ]);
  readonly lisaUseOptions: SelectOption[] = [
    { value: false, label: 'Standard withdrawal' },
    { value: true, label: 'Qualifying first home purchase' },
  ];
  readonly yesNoOptions: SelectOption[] = [
    { value: true, label: 'Yes' },
    { value: false, label: 'No' },
  ];

  ngOnInit(): void {
    this.sortAllByAge();
    this.lumpSums.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.sortArrayByAge(this.lumpSums));
    this.futureContributions.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.sortArrayByAge(this.futureContributions));
    this.drawdownSchedule.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.sortArrayByAge(this.drawdownSchedule));
  }

  get lumpSums(): FormArray<FormGroup> {
    return this.form().get('lumpSums') as FormArray<FormGroup>;
  }

  get drawdownSchedule(): FormArray<FormGroup> {
    return this.form().get('drawdownSchedule') as FormArray<FormGroup>;
  }

  get futureContributions(): FormArray<FormGroup> {
    return this.form().get('futureContributions') as FormArray<FormGroup>;
  }

  addLumpSum(): void {
    this.lumpSums.push(
      this.fb.group({
        id: this.fb.control(crypto.randomUUID(), { nonNullable: true }),
        label: this.fb.control('One-off expense', [Validators.required]),
        age: this.fb.control(65, [Validators.required]),
        amount: this.fb.control(0, [Validators.required, Validators.min(0)]),
        fromSource: this.fb.control('any', [Validators.required]),
        lisaUseForFirstHome: this.fb.control(false, [Validators.required]),
        lisaFirstTimeBuyer: this.fb.control(false, [Validators.required]),
        lisaPropertyPrice: this.fb.control(0, [Validators.min(0)]),
        lisaMonthsOpen: this.fb.control(0, [Validators.min(0)]),
      }),
    );
    this.sortArrayByAge(this.lumpSums);
  }

  addDrawdownRow(): void {
    this.drawdownSchedule.push(
      this.fb.group({
        age: this.fb.control(60, [Validators.required]),
        annualAmount: this.fb.control(0, [Validators.required, Validators.min(0)]),
        fromSource: this.fb.control('proportional', [Validators.required]),
      }),
    );
    this.sortArrayByAge(this.drawdownSchedule);
  }

  addFutureContribution(): void {
    this.futureContributions.push(
      this.fb.group({
        id: this.fb.control(crypto.randomUUID(), { nonNullable: true }),
        label: this.fb.control('Inheritance', [Validators.required]),
        age: this.fb.control(65, [Validators.required]),
        amount: this.fb.control(0, [Validators.required, Validators.min(0)]),
        toSource: this.fb.control('any', [Validators.required]),
      }),
    );
    this.sortArrayByAge(this.futureContributions);
  }

  remove(arr: FormArray<FormGroup>, index: number): void {
    arr.removeAt(index);
  }

  sortAllByAge(): void {
    this.sortArrayByAge(this.lumpSums);
    this.sortArrayByAge(this.futureContributions);
    this.sortArrayByAge(this.drawdownSchedule);
  }

  private sortArrayByAge(arr: FormArray<FormGroup>): void {
    const sorted = [...arr.controls].sort((a, b) => {
      const ageA = Number(a.get('age')?.value ?? 0);
      const ageB = Number(b.get('age')?.value ?? 0);
      return ageA - ageB;
    });

    const changed = sorted.some((control, index) => control !== arr.at(index));
    if (!changed) {
      return;
    }

    arr.clear({ emitEvent: false });
    for (const control of sorted) {
      arr.push(control, { emitEvent: false });
    }
    arr.updateValueAndValidity({ emitEvent: true });
  }
}
