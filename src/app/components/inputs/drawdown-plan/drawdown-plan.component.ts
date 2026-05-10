import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, input } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-drawdown-plan',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './drawdown-plan.component.html',
  styleUrl: './drawdown-plan.component.scss',
})
export class DrawdownPlanComponent {
  private readonly fb = inject(FormBuilder);

  readonly form = input.required<FormGroup>();
  readonly sourceOptions = input.required<Array<{ id: string; label: string }>>();

  ngOnInit(): void {
    this.sortAllByAge();
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
