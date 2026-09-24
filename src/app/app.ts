import {
  Component,
  AfterViewChecked,
  OnDestroy,
  HostListener,
  ViewChild,
  ElementRef,
  signal,
  effect,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService, SwechhaContent } from './content.service';

/* =========================================================
   DATA MODELS
   ========================================================= */
export interface ImageRef {
  url: string;
  path?: string;
}

export interface Episode {
  id: number;
  title: string;
  text: string;
  image: string;
}

export interface CharacterEntry {
  id: number;
  name: string;
  role: string;
  description: string;
  photo: string;                 // image #1 (unchanged, backwards compatible)
  extraPhotos?: string[];        // additional image URLs
  autoScrollSeconds?: number;    // carousel interval in seconds (default 4)
}

export interface MoodImage {
  id: number;
  src: string;
  caption: string;
}

export interface TechLink {
  id: number;
  label: string;
  url: string;
}

export interface TechItem {
  id: number;
  image: string;
  heading: string;
  text: string;
  links: TechLink[];
}

export interface Article {
  id: number;
  title: string;
  description: string;
  link: string;
  image: string;
}

export interface AboutLink {
  id: number;
  label: string;
  url: string;
}

/* =========================================================
   COMPONENT
   ========================================================= */
@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements AfterViewChecked, OnDestroy {
  private content = inject(ContentService);

  /* ---------- AUTH STATE ---------- */
  username = '';
  password = '';
  isAdmin = false;

  /* ---------- TIMER / NETWORK-DRIVEN STATE ---------- */
  isLoggedIn = signal(false);
  isLoading = signal(false);
  loadingProgress = signal(0);
  loadingStatusText = signal('SYSTEM INITIALIZING');
  bootLines = signal<string[]>([]);
  scrollProgress = signal(0);
  glitchActive = signal(false);
  logoDocked = signal(false);
  introDismissed = signal(false);

  /* ---------- LIGHTBOX + CHARACTER CAROUSEL ---------- */
  lightbox = signal<{ images: string[]; index: number; alt: string } | null>(null);
  charSlides = signal<Record<number, number>>({});
  hoveredCharId: number | null = null;

  private carouselTimer: any = null;
  private lastAdvance = new Map<number, number>();
  private readonly DEFAULT_INTERVAL = 4;

  /** Large ambient backdrop image. Falls back to a bundled asset until an admin overrides it. */
  backgroundImage = signal<ImageRef>({ url: '' });

  private loadingTimer: any = null;
  private dockTimer: any = null;

  private readonly loadingStatusSteps = [
    'SYSTEM INITIALIZING',
    'VERIFYING ACCESS',
    'LOADING ARCHIVE',
    'DECRYPTING CONTENT',
    'ACCESS GRANTED'
  ];
  private readonly bootFeedLines = [
    '> SWECHHA_OS: cold boot',
    '> identity layer: waking',
    '> credential stream: detected',
    '> tracing origin node...',
    '> archive index: loading',
    '> integrity check: passed',
    '> session handshake: complete'
  ];

  /* ---------- NOISE CANVAS ---------- */
  @ViewChild('noiseCanvas') noiseCanvasRef?: ElementRef<HTMLCanvasElement>;
  private noiseCtx: CanvasRenderingContext2D | null = null;
  private noiseRafId: number | null = null;
  private noiseLastTs = 0;
  private noiseCanvasBound = false;

  /* ---------- SCROLL-REVEAL ---------- */
  private revealObserver: IntersectionObserver | null = null;
  private revealBound = false;

  /* ---------- ID COUNTER ---------- */
  private idCounter = 1000;
  private nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  /* ---------- EDIT TOGGLES ---------- */
  editing: { [key: string]: boolean } = {
    logline: false,
    synopsis: false,
    episodic: false,
    characters: false,
    moodboard: false,
    technicalities: false,
    directors: false,
    about: false
  };

  /* =========================================================
     CONTENT
     ========================================================= */

  logline = signal(
    'A city on the edge of collapse. A platform that promises freedom. ' +
      'SWECHHA follows one operator who discovers the system she trusts is the one erasing her.'
  );

  synopsis = signal(
    'Set in the near-future sprawl of Bhagyanagaram, SWECHHA is a serialized thriller about ' +
      'surveillance, identity, and the cost of staying logged in. As the city\u2019s last independent network ' +
      'goes dark, our protagonist must decide whether to burn the system down or become part of it.'
  );

  episodes = signal<Episode[]>([
    {
      id: 1,
      title: 'EP 01 — WAKE',
      text: 'The system boots. Our protagonist logs in for what she believes is a routine shift, unaware the network has already flagged her.',
      image: 'https://placehold.co/500x700/0a0000/ff163d?text=EP+01'
    }
  ]);

  characters = signal<CharacterEntry[]>([
    {
      id: 1,
      name: 'ARYA NAIR',
      role: 'Protagonist / Operator',
      description: 'A network technician who begins to suspect the platform she maintains is watching more than it protects.',
      photo: 'https://placehold.co/400x500/0a0000/ff163d?text=ARYA',
      extraPhotos: [],
      autoScrollSeconds: 4
    }
  ]);

  moodBoard = signal<MoodImage[]>([
    { id: 1, src: 'https://placehold.co/720x1280/0a0000/ff163d?text=MOOD+01', caption: 'Neon-soaked skyline' }
  ]);

  technicalities = signal<TechItem[]>([
    {
      id: 1,
      image: 'https://placehold.co/720x1280/0a0000/ff163d?text=TECH+01',
      heading: 'FORMAT',
      text: 'An 8-episode limited series, 30–40 minutes per episode, shot in a hybrid of practical neon lighting and desaturated urban exteriors.',
      links: [{ id: 1, label: 'Series Bible (PDF)', url: 'https://example.com/series-bible' }]
    }
  ]);

  directorsNotesText = signal(
    'SWECHHA started as a question: what happens when the platform meant to protect a city ' +
      'becomes the thing everyone is afraid of? This project is my attempt to make surveillance feel personal again — ' +
      'not abstract, not political theatre, just one person realizing the system knows her better than she knows herself.'
  );

  directorsNotesImages = signal<MoodImage[]>([
    { id: 1, src: 'https://placehold.co/700x400/0a0000/ff163d?text=SET+PHOTO', caption: 'Location scout, Old City sector' }
  ]);

  articles = signal<Article[]>([
    {
      id: 1,
      title: 'The Rise of Ambient Surveillance Cinema',
      description: 'A look at how recent thrillers are using UI and system-glitch aesthetics as a narrative device.',
      link: 'https://example.com/article-1',
      image: 'https://placehold.co/300x180/0a0000/00f7ff?text=ARTICLE'
    }
  ]);

  aboutMe = signal<{ photo: string; photoPath?: string; bio: string; links: AboutLink[] }>({
    photo: 'https://placehold.co/400x500/0a0000/ff163d?text=DIRECTOR',
    bio: 'I\u2019m a writer-director working at the intersection of thriller and speculative fiction. SWECHHA is my ' +
      'first serialized project, built from years of watching how cities and platforms quietly reshape each other.',
    links: [
      { id: 1, label: 'Portfolio', url: 'https://example.com' },
      { id: 2, label: 'Contact', url: 'mailto:hello@example.com' }
    ]
  });

  constructor() {
    // Firestore -> local signals, for every viewer. Skips a section the
    // current user is mid-edit on, so a remote update can't clobber typing.
    effect(() => {
      const remote = this.content.content();
      if (!remote) return;

      if (!this.editing['logline'] && remote.logline !== undefined) this.logline.set(remote.logline);
      if (!this.editing['synopsis'] && remote.synopsis !== undefined) this.synopsis.set(remote.synopsis);
      if (!this.editing['episodic'] && remote.episodes) this.episodes.set(remote.episodes);
      if (!this.editing['characters'] && remote.characters) this.characters.set(remote.characters);
      if (!this.editing['moodboard'] && remote.moodBoard) this.moodBoard.set(remote.moodBoard);
      if (!this.editing['technicalities'] && remote.technicalities) this.technicalities.set(remote.technicalities);
      if (!this.editing['directors']) {
        if (remote.directorsNotesText !== undefined) this.directorsNotesText.set(remote.directorsNotesText);
        if (remote.directorsNotesImages) this.directorsNotesImages.set(remote.directorsNotesImages);
        if (remote.articles) this.articles.set(remote.articles);
      }
      if (!this.editing['about'] && remote.aboutMe) this.aboutMe.set(remote.aboutMe);
      if (remote.backgroundImage?.url) this.backgroundImage.set(remote.backgroundImage);
    });

    effect(() => {
      if (this.content.ready() && !this.content.content()) {
        this.content.seedIfEmpty(this.snapshotContent());
      }
    });
  }

  private snapshotContent(): SwechhaContent {
    return {
      logline: this.logline(),
      synopsis: this.synopsis(),
      episodes: this.episodes(),
      characters: this.characters(),
      moodBoard: this.moodBoard(),
      technicalities: this.technicalities(),
      directorsNotesText: this.directorsNotesText(),
      directorsNotesImages: this.directorsNotesImages(),
      articles: this.articles(),
      aboutMe: this.aboutMe(),
      backgroundImage: this.backgroundImage()
    };
  }

  /* ---------- LINK VALIDATION ---------- */
  isValidUrl(url: string): boolean {
    if (!url) return false;
    const trimmed = url.trim();
    if (trimmed.startsWith('mailto:')) return trimmed.length > 'mailto:'.length;
    try {
      const u = new URL(trimmed);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /** Drops half-filled links (no url) before saving; keeps the admin's edit view untouched. */
  private cleanLinks<T extends { label: string; url: string }>(links: T[]): T[] {
    return links.filter(l => l.url && l.url.trim() !== '');
  }

  private saveSection(section: string): void {
    let partial: Partial<SwechhaContent> | null = null;
    switch (section) {
      case 'logline':
        partial = { logline: this.logline() };
        break;
      case 'synopsis':
        partial = { synopsis: this.synopsis() };
        break;
      case 'episodic':
        partial = { episodes: this.episodes() };
        break;
      case 'characters':
        // Strip blank extra URLs, clamp the interval, and avoid undefined (Firestore rejects it)
        this.characters.update(list =>
          list.map(c => ({
            ...c,
            extraPhotos: (c.extraPhotos ?? []).map(u => (u || '').trim()).filter(Boolean),
            autoScrollSeconds: this.clampInterval(c.autoScrollSeconds)
          }))
        );
        partial = { characters: this.characters() };
        break;
      case 'moodboard':
        partial = { moodBoard: this.moodBoard() };
        break;
      case 'technicalities':
        this.technicalities.update(list => list.map(t => ({ ...t, links: this.cleanLinks(t.links) })));
        partial = { technicalities: this.technicalities() };
        break;
      case 'directors':
        partial = {
          directorsNotesText: this.directorsNotesText(),
          directorsNotesImages: this.directorsNotesImages(),
          articles: this.articles()
        };
        break;
      case 'about':
        this.aboutMe.update(a => ({ ...a, links: this.cleanLinks(a.links) }));
        partial = { aboutMe: this.aboutMe() };
        break;
    }
    if (partial) {
      this.content.save(partial).catch(err => console.error('Save failed:', section, err));
    }
  }

  /* =========================================================
     LIFECYCLE
     ========================================================= */
  ngAfterViewChecked(): void {
    if (this.isLoggedIn() && this.noiseCanvasRef && !this.noiseCanvasBound) {
      this.noiseCanvasBound = true;
      this.initNoiseCanvas();
    }
    if (this.isLoggedIn() && !this.revealBound) {
      const slides = document.querySelectorAll('.content-slide');
      if (slides.length) {
        this.revealBound = true;
        this.initRevealObserver(slides);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.loadingTimer) clearInterval(this.loadingTimer);
    if (this.dockTimer) clearTimeout(this.dockTimer);
    if (this.noiseRafId !== null) cancelAnimationFrame(this.noiseRafId);
    if (this.revealObserver) this.revealObserver.disconnect();
    this.stopCarousel();
    document.body.style.overflow = '';
  }

  private initRevealObserver(slides: NodeListOf<Element>): void {
    this.revealObserver = new IntersectionObserver(
      entries => entries.forEach(entry => entry.isIntersecting && entry.target.classList.add('is-visible')),
      { threshold: 0.18 }
    );
    slides.forEach(slide => this.revealObserver!.observe(slide));
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop;
    const max = doc.scrollHeight - doc.clientHeight;
    this.scrollProgress.set(max > 0 ? Math.min(100, (scrollTop / max) * 100) : 0);

    // The glitch title is the first post-login screen.
    // A small scroll starts the cinematic transition into Section 01.
    this.introDismissed.set(scrollTop > Math.max(24, window.innerHeight * 0.06));
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.resizeNoiseCanvas();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (!this.lightbox()) return;
    if (e.key === 'Escape') this.closeImage();
    else if (e.key === 'ArrowRight') this.stepLightbox(1);
    else if (e.key === 'ArrowLeft') this.stepLightbox(-1);
  }

  /* =========================================================
     LOGIN
     ========================================================= */
  login(): void {
    const cleanUsername = (this.username || '').trim().toLowerCase();
    this.isAdmin = cleanUsername === 'cooler';
    this.startLoadingSequence();
  }

  logout(): void {
    if (this.loadingTimer) clearInterval(this.loadingTimer);
    if (this.dockTimer) clearTimeout(this.dockTimer);
    this.stopCarousel();
    this.closeImage();
    this.isLoggedIn.set(false);
    this.isLoading.set(false);
    this.logoDocked.set(false);
    this.introDismissed.set(false);
    this.isAdmin = false;
    this.username = '';
    this.password = '';
    this.noiseCanvasBound = false;
    if (this.noiseRafId !== null) {
      cancelAnimationFrame(this.noiseRafId);
      this.noiseRafId = null;
    }
    this.revealBound = false;
    if (this.revealObserver) {
      this.revealObserver.disconnect();
      this.revealObserver = null;
    }
  }

  /**
   * SYSTEM INITIALIZING -> VERIFYING ACCESS -> LOADING ARCHIVE ->
   * DECRYPTING CONTENT -> ACCESS GRANTED, ~3.5–4s total.
   */
  private startLoadingSequence(): void {
    this.isLoading.set(true);
    this.introDismissed.set(false);
    this.loadingProgress.set(0);
    this.bootLines.set([]);
    this.loadingStatusText.set(this.loadingStatusSteps[0]);
    let statusIndex = 0;
    let bootIndex = 0;

    this.loadingTimer = setInterval(() => {
      const next = this.loadingProgress() + 3.5 + Math.random() * 5;
      this.loadingProgress.set(Math.min(next, 100));

      const statusThreshold = Math.floor((this.loadingProgress() / 100) * this.loadingStatusSteps.length);
      if (statusThreshold > statusIndex && statusThreshold < this.loadingStatusSteps.length) {
        statusIndex = statusThreshold;
        this.loadingStatusText.set(this.loadingStatusSteps[statusIndex]);
      }

      if (bootIndex < this.bootFeedLines.length && Math.random() > 0.4) {
        this.bootLines.update(lines => [...lines, this.bootFeedLines[bootIndex]]);
        bootIndex += 1;
      }

      if (this.loadingProgress() >= 100) {
        this.loadingStatusText.set('ACCESS GRANTED');
        clearInterval(this.loadingTimer);
        setTimeout(() => {
          this.isLoading.set(false);
          this.isLoggedIn.set(true);
          this.startCarousel();
          this.logoDocked.set(false);
          this.triggerGlitch();
          this.dockTimer = setTimeout(() => this.logoDocked.set(true), 650);
        }, 400);
      }
    }, 190);
  }

  triggerGlitch(): void {
    this.glitchActive.set(false);
    setTimeout(() => {
      this.glitchActive.set(true);
      setTimeout(() => this.glitchActive.set(false), 480);
    }, 20);
  }

  /* =========================================================
     NOISE CANVAS
     ========================================================= */
  private initNoiseCanvas(): void {
    const canvas = this.noiseCanvasRef?.nativeElement;
    if (!canvas) return;
    this.noiseCtx = canvas.getContext('2d', { alpha: true });
    this.resizeNoiseCanvas();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) this.noiseRafId = requestAnimationFrame(this.drawNoise);
  }

  private resizeNoiseCanvas(): void {
    const canvas = this.noiseCanvasRef?.nativeElement;
    if (!canvas) return;
    canvas.width = Math.max(160, Math.floor(window.innerWidth / 3));
    canvas.height = Math.max(260, Math.floor(window.innerHeight / 3));
  }

  private drawNoise = (ts: number): void => {
    if (!this.noiseCtx || !this.noiseCanvasRef) return;
    if (ts - this.noiseLastTs > 90) {
      this.noiseLastTs = ts;
      const canvas = this.noiseCanvasRef.nativeElement;
      const w = canvas.width;
      const h = canvas.height;
      const img = this.noiseCtx.createImageData(w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = v;
        img.data[i + 1] = Math.random() > 0.88 ? 30 : v * 0.06;
        img.data[i + 2] = Math.random() > 0.92 ? 80 : v * 0.04;
        img.data[i + 3] = Math.random() > 0.76 ? 34 : 0;
      }
      this.noiseCtx.putImageData(img, 0, 0);
    }
    this.noiseRafId = requestAnimationFrame(this.drawNoise);
  };

  /* =========================================================
     LIGHTBOX
     ========================================================= */
  openImage(images: string[], index = 0, alt = ''): void {
    const list = images.filter(Boolean);
    if (!list.length) return;
    this.lightbox.set({ images: list, index: Math.min(index, list.length - 1), alt });
    document.body.style.overflow = 'hidden';
  }

  closeImage(): void {
    this.lightbox.set(null);
    document.body.style.overflow = '';
  }

  stepLightbox(dir: number): void {
    const lb = this.lightbox();
    if (!lb || lb.images.length < 2) return;
    const index = (lb.index + dir + lb.images.length) % lb.images.length;
    this.lightbox.set({ ...lb, index });
  }

  /* =========================================================
     CHARACTER IMAGES + AUTO-SCROLL
     ========================================================= */
  charImages(c: CharacterEntry): string[] {
    return [c.photo, ...(c.extraPhotos ?? [])].map(u => (u || '').trim()).filter(Boolean);
  }

  currentIndex(c: CharacterEntry): number {
    const len = this.charImages(c).length;
    return Math.min(this.charSlides()[c.id] ?? 0, Math.max(0, len - 1));
  }

  goToImage(c: CharacterEntry, i: number): void {
    this.charSlides.update(s => ({ ...s, [c.id]: i }));
    this.lastAdvance.set(c.id, Date.now()); // restart this card's timer
  }

  addExtraPhoto(c: CharacterEntry): void {
    c.extraPhotos = [...(c.extraPhotos ?? []), ''];
  }
  setExtraPhoto(c: CharacterEntry, i: number, url: string): void {
    const list = [...(c.extraPhotos ?? [])];
    list[i] = url;
    c.extraPhotos = list;
  }
  removeExtraPhoto(c: CharacterEntry, i: number): void {
    c.extraPhotos = (c.extraPhotos ?? []).filter((_, idx) => idx !== i);
  }

  private clampInterval(v: unknown): number {
    return Math.min(60, Math.max(1, Number(v) || this.DEFAULT_INTERVAL));
  }

  private startCarousel(): void {
    this.stopCarousel();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.carouselTimer = setInterval(() => this.carouselTick(), 500);
  }

  private stopCarousel(): void {
    if (this.carouselTimer) clearInterval(this.carouselTimer);
    this.carouselTimer = null;
  }

  private carouselTick(): void {
    // Pause while the modal is open or characters are being edited
    if (this.lightbox() || this.editing['characters']) return;

    const now = Date.now();
    const next = { ...this.charSlides() };
    let changed = false;

    for (const c of this.characters()) {
      const len = this.charImages(c).length;
      if (len < 2 || this.hoveredCharId === c.id) {   // pause on hover
        this.lastAdvance.set(c.id, now);
        continue;
      }
      const last = this.lastAdvance.get(c.id) ?? now;
      if (!this.lastAdvance.has(c.id)) this.lastAdvance.set(c.id, now);

      if (now - last >= this.clampInterval(c.autoScrollSeconds) * 1000) {
        next[c.id] = ((next[c.id] ?? 0) + 1) % len;
        this.lastAdvance.set(c.id, now);
        changed = true;
      }
    }
    if (changed) this.charSlides.set(next);
  }

  /* =========================================================
     EDIT TOGGLE
     ========================================================= */
  toggleEdit(section: string): void {
    const wasEditing = this.editing[section];
    this.editing[section] = !wasEditing;
    if (wasEditing) this.saveSection(section);
  }

  /* ---------- EPISODES ---------- */
  addEpisode(): void {
    this.episodes.update(list => [...list, { id: this.nextId(), title: '', text: '', image: '' }]);
  }
  removeEpisode(id: number): void {
    this.episodes.update(list => list.filter(ep => ep.id !== id));
  }

  /* ---------- CHARACTERS ---------- */
  addCharacter(): void {
    this.characters.update(list => [
      ...list,
      { id: this.nextId(), name: '', role: '', description: '', photo: '', extraPhotos: [], autoScrollSeconds: 4 }
    ]);
  }
  removeCharacter(id: number): void {
    this.characters.update(list => list.filter(char => char.id !== id));
  }

  updateBackgroundImageUrl(url: string): void {
    this.backgroundImage.set({ url });
    this.content.save({ backgroundImage: { url } }).catch(err => console.error('Background save failed:', err));
  }

  /* ---------- TECHNICALITIES ---------- */
  addTechItem(): void {
    this.technicalities.update(list => [...list, { id: this.nextId(), image: '', heading: '', text: '', links: [] }]);
  }
  removeTechItem(id: number): void {
    this.technicalities.update(list => list.filter(t => t.id !== id));
  }
  addTechLink(item: TechItem): void {
    item.links.push({ id: this.nextId(), label: '', url: '' });
  }
  removeTechLink(item: TechItem, linkId: number): void {
    item.links = item.links.filter(l => l.id !== linkId);
  }

  addMoodImage(): void {
    this.moodBoard.update(list => [...list, { id: this.nextId(), src: '', caption: '' }]);
  }
  removeMoodImage(id: number): void {
    this.moodBoard.update(list => list.filter(item => item.id !== id));
  }

  addDirectorsImage(): void {
    this.directorsNotesImages.update(list => [...list, { id: this.nextId(), src: '', caption: '' }]);
  }
  removeDirectorsImage(id: number): void {
    this.directorsNotesImages.update(list => list.filter(item => item.id !== id));
  }

  /* ---------- DIRECTOR'S NOTES ---------- */
  addArticle(): void {
    this.articles.update(list => [...list, { id: this.nextId(), title: '', description: '', link: '', image: '' }]);
  }
  removeArticle(id: number): void {
    this.articles.update(list => list.filter(item => item.id !== id));
  }

  /* ---------- ABOUT ME ---------- */
  addAboutLink(): void {
    this.aboutMe.update(a => ({ ...a, links: [...a.links, { id: this.nextId(), label: '', url: '' }] }));
  }
  removeAboutLink(id: number): void {
    this.aboutMe.update(a => ({ ...a, links: a.links.filter(l => l.id !== id) }));
  }

  /* ---------- MISC ---------- */
  trackById(_index: number, item: { id: number }): number {
    return item.id;
  }

  trackByIndex(index: number): number {
    return index;
  }
}