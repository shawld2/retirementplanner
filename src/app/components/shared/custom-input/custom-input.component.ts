import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

@Component({
  selector: 'app-custom-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="input-wrapper" [class.focused]="focused" [class.disabled]="disabled">
      <label *ngIf="label" class="input-label" [attr.for]="inputId">{{ label }}</label>
      <div class="input-container">
        <span *ngIf="prefix" class="input-prefix">{{ prefix }}</span>
        <input
          [id]="inputId"
          [type]="type"
          [placeholder]="placeholder"
          [disabled]="disabled"
          [attr.min]="min"
          [attr.max]="max"
          [attr.step]="step"
          [(ngModel)]="value"
          (ngModelChange)="onValueChange($event)"
          (focus)="onFocus()"
          (blur)="onBlur()"
          class="custom-input"
        />
        <span *ngIf="suffix" class="input-suffix">{{ suffix }}</span>
      </div>
    </div>
  `,
  styles: [`
    .input-wrapper {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
    }

    .input-label {
      font-size: 13px;
      font-weight: 500;
      color: #4a5568;
      letter-spacing: 0.01em;
    }

    .input-container {
      display: flex;
      align-items: center;
      width: 100%;
      height: 52px;
      padding: 0 16px;
      background: #ffffff;
      border: 2px solid #2d3748;
      border-radius: 14px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .input-wrapper.focused .input-container {
      border-color: #1a365d;
      box-shadow: 0 0 0 3px rgba(26, 54, 93, 0.1);
    }

    .input-wrapper.disabled .input-container {
      background: #f7fafc;
      border-color: #cbd5e0;
      cursor: not-allowed;
    }

    .input-prefix,
    .input-suffix {
      font-size: 15px;
      font-weight: 500;
      color: #718096;
      flex-shrink: 0;
    }

    .input-prefix {
      margin-right: 8px;
    }

    .input-suffix {
      margin-left: 8px;
    }

    .custom-input {
      flex: 1;
      width: 100%;
      height: 100%;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 15px;
      font-weight: 500;
      color: #1a202c;
      background: transparent;
      border: none;
      outline: none;

      &::placeholder {
        color: #a0aec0;
        font-weight: 400;
      }

      &:disabled {
        color: #a0aec0;
        cursor: not-allowed;
      }

      /* Hide number input spinners */
      &[type="number"]::-webkit-inner-spin-button,
      &[type="number"]::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      &[type="number"] {
        -moz-appearance: textfield;
      }
    }
  `],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomInputComponent),
      multi: true
    }
  ]
})
export class CustomInputComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() type: 'text' | 'number' | 'email' | 'password' = 'text';
  @Input() prefix = '';
  @Input() suffix = '';
  @Input() min?: number;
  @Input() max?: number;
  @Input() step?: number;
  @Input() inputId = `input-${Math.random().toString(36).substr(2, 9)}`;

  value: any = '';
  disabled = false;
  focused = false;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: any): void {
    this.value = value;
  }

  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onValueChange(value: any): void {
    this.value = value;
    this.onChange(value);
  }

  onFocus(): void {
    this.focused = true;
  }

  onBlur(): void {
    this.focused = false;
    this.onTouched();
  }
}
