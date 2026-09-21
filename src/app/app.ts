import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly userName = signal('');
  protected readonly isLoggedIn = signal(false);
  protected readonly isEditor = signal(false);
  protected readonly activeSection = signal('signal');

  protected login(): void {
    const name = this.userName().trim();
    this.isEditor.set(name.toLowerCase() === 'madhu');
    this.isLoggedIn.set(true);
  }

  protected logout(): void {
    this.isLoggedIn.set(false);
    this.isEditor.set(false);
    this.userName.set('');
  }

  protected setActiveSection(section: string): void {
    this.activeSection.set(section);
  }

  protected updateUserName(event: Event): void {
    this.userName.set((event.target as HTMLInputElement).value);
  }
}
