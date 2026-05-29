import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

export interface SelectOption {
  value: any;
  label: string;
}

@Component({
  selector: 'app-custom-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="select-wrapper" [class.focused]="focused" [class.disabled]="disabled">
      <label *ngIf="label" class="select-label" [attr.for]="selectId">{{ label }}</label>
      <div class="select-container">
        <select
          [id]="selectId"
          [disabled]="disabled"
          [(ngModel)]="value"
          (ngModelChange)="onValueChange($event)"
          (focus)="onFocus()"
          (blur)="onBlur()"
          class="custom-select"
        >
          <option *ngIf="placeholder" value="" disabled>{{ placeholder }}</option>
          <option *ngFor="let opt of options" [ngValue]="opt.value">{{ opt.label }}</option>
        </select>
        <span class="select-arrow">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </div>
    </div>
  `,
  styles: [`
    .select-wrapper {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
    }

    .select-label {
      font-size: 13px;
      font-weight: 500;
      color: #4a5568;
      letter-spacing: 0.01em;
    }

    .select-container {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
      height: 52px;
      background: #ffffff;
      border: 2px solid #2d3748;
      border-radius: 14px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .select-wrapper.focused .select-container {
      border-color: #1a365d;
      box-shadow: 0 0 0 3px rgba(26, 54, 93, 0.1);
    }

    .select-wrapper.disabled .select-container {
      background: #f7fafc;
      border-color: #cbd5e0;
      cursor: not-allowed;
    }

    .custom-select {
      appearance: none;
      width: 100%;
      height: 100%;
      padding: 0 40px 0 16px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 15px;
      font-weight: 500;
      color: #1a202c;
      background: transparent;
      border: none;
      outline: none;
      cursor: pointer;

      &:disabled {
        color: #a0aec0;
        cursor: not-allowed;
      }

      option {
        font-weight: 400;
        padding: 8px;
      }
    }

    .select-arrow {
      position: absolute;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      color: #4a5568;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomSelectComponent),
      multi: true
    }
  ]
})
export class CustomSelectComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() options: SelectOption[] = [];
  @Input() selectId = `select-${Math.random().toString(36).substr(2, 9)}`;

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
