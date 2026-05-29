import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { CustomInputComponent } from '../../shared/custom-input/custom-input.component';

@Component({
  selector: 'app-personal-inputs',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatSlideToggleModule,
    CustomInputComponent,
  ],
  templateUrl: './personal-inputs.component.html',
  styleUrl: './personal-inputs.component.scss',
})
export class PersonalInputsComponent {
  readonly form = input.required<FormGroup>();
}
