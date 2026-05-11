import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-projection-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonToggleModule,
    MatSliderModule,
    MatCheckboxModule,
  ],
  templateUrl: './projection-settings.component.html',
  styleUrl: './projection-settings.component.scss',
})
export class ProjectionSettingsComponent {
  readonly form = input.required<FormGroup>();
  readonly includePartner = input<boolean>(false);
  readonly taxBands = input.required<FormArray>();
  readonly addTaxBand = output<void>();
  readonly removeTaxBand = output<number>();

  sliderValue(controlName: string, fallback = 0): number {
    const value = this.form().get(controlName)?.value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  onSliderChange(controlName: string, value: number): void {
    const control = this.form().get(controlName);
    if (!control) {
      return;
    }

    control.setValue(value);
    control.markAsDirty();
    control.markAsTouched();
  }

  returnScenarioSliderValue(): number {
    const scenario = this.form().get('returnScenario')?.value;
    if (scenario === 'low') {
      return 0;
    }

    if (scenario === 'high') {
      return 2;
    }

    return 1;
  }

  onReturnScenarioSliderChange(value: number): void {
    const control = this.form().get('returnScenario');
    if (!control) {
      return;
    }

    const rounded = Math.round(Number(value));
    const scenario = rounded <= 0 ? 'low' : (rounded >= 2 ? 'high' : 'medium');
    control.setValue(scenario);
    control.markAsDirty();
    control.markAsTouched();
  }
}
