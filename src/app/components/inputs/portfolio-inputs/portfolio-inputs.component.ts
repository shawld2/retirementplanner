import { CommonModule } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-portfolio-inputs',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
  ],
  templateUrl: './portfolio-inputs.component.html',
  styleUrl: './portfolio-inputs.component.scss',
})
export class PortfolioInputsComponent {
  private readonly fb = inject(FormBuilder);

  readonly form = input.required<FormGroup>();
  readonly includePartner = input.required<boolean>();

  get mePensions(): FormArray<FormGroup> {
    return this.form().get('mePensions') as FormArray<FormGroup>;
  }

  get meIsas(): FormArray<FormGroup> {
    return this.form().get('meIsas') as FormArray<FormGroup>;
  }

  get partnerPensions(): FormArray<FormGroup> {
    return this.form().get('partnerPensions') as FormArray<FormGroup>;
  }

  get partnerIsas(): FormArray<FormGroup> {
    return this.form().get('partnerIsas') as FormArray<FormGroup>;
  }

  get properties(): FormArray<FormGroup> {
    return this.form().get('properties') as FormArray<FormGroup>;
  }

  addMeDc(): void {
    this.mePensions.push(this.createPension('DC', 'Me DC Pension'));
  }

  addMeDb(): void {
    this.mePensions.push(this.createPension('DB', 'Me Pension'));
  }

  addPartnerDc(): void {
    this.partnerPensions.push(this.createPension('DC', 'Partner DC Pension'));
  }

  addPartnerDb(): void {
    this.partnerPensions.push(this.createPension('DB', 'Partner Pension'));
  }

  addMeIsa(): void {
    this.meIsas.push(this.createIsa('Me ISA', 'ISA'));
  }

  addPartnerIsa(): void {
    this.partnerIsas.push(this.createIsa('Partner ISA', 'ISA'));
  }

  addProperty(): void {
    this.properties.push(this.createProperty('Property'));
  }

  onPropertyTypeChanged(propertyGroup: FormGroup, propertyType: 'residential' | 'buy-to-let'): void {
    const rentalControl = propertyGroup.get('annualRentalIncome');
    if (!rentalControl) {
      return;
    }

    if (propertyType === 'buy-to-let') {
      rentalControl.enable({ emitEvent: false });
      return;
    }

    rentalControl.setValue(0, { emitEvent: false });
    rentalControl.disable({ emitEvent: false });
  }

  remove(arr: FormArray<FormGroup>, index: number): void {
    arr.removeAt(index);
  }

  createPension(type: 'DC' | 'DB', label: string): FormGroup {
    return this.fb.group({
      id: this.fb.control(crypto.randomUUID(), { nonNullable: true }),
      label: this.fb.control(label, [Validators.required]),
      type: this.fb.control(type, [Validators.required]),
      currentValue: this.fb.control(type === 'DC' ? 0 : null),
      annualContribution: this.fb.control(0),
      employerContribution: this.fb.control(0),
      dbAnnualPension: this.fb.control(type === 'DB' ? 0 : null),
      dbLumpSum: this.fb.control(type === 'DB' ? 0 : null),
      dbPensionAge: this.fb.control(type === 'DB' ? 60 : null),
      taxFreePercentage: this.fb.control(type === 'DC' ? 25 : 0, [Validators.min(0), Validators.max(25)]),
      chargesPercent: this.fb.control(0),
    });
  }

  createIsa(label: string, isaType: 'ISA' | 'LISA' | 'CASH_ISA'): FormGroup {
    return this.fb.group({
      id: this.fb.control(crypto.randomUUID(), { nonNullable: true }),
      label: this.fb.control(label, [Validators.required]),
      isaType: this.fb.control<'ISA' | 'LISA' | 'CASH_ISA'>(isaType, [Validators.required]),
      currentValue: this.fb.control(0, [Validators.min(0)]),
      annualContribution: this.fb.control(0, [Validators.min(0)]),
      chargesPercent: this.fb.control(0),
    });
  }

  createProperty(label: string): FormGroup {
    return this.fb.group({
      id: this.fb.control(crypto.randomUUID(), { nonNullable: true }),
      label: this.fb.control(label, [Validators.required]),
      propertyType: this.fb.control<'residential' | 'buy-to-let'>('residential', [Validators.required]),
      currentValue: this.fb.control(0, [Validators.required, Validators.min(0)]),
      mortgageType: this.fb.control<'repayment' | 'interest-only'>('repayment', [Validators.required]),
      mortgageOutstanding: this.fb.control(0, [Validators.required, Validators.min(0)]),
      mortgageRatePercent: this.fb.control(0, [Validators.required, Validators.min(0), Validators.max(100)]),
      mortgageYearsRemaining: this.fb.control(0, [Validators.required, Validators.min(0), Validators.max(60)]),
      annualRentalIncome: this.fb.control({ value: 0, disabled: true }, [Validators.required, Validators.min(0)]),
    });
  }
}
