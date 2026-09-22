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
import { ContentService, SwechaContent } from './content.service';

/* =========================================================
   DATA MODELS
   ========================================================= */
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
  photo: string;
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

  /* ---------- AUTH STATE (plain — only ever written inside
     click/submit handlers, so zoneless CD already sees them) ---------- */
  username = '';
  password = '';
  isAdmin = false;

  /* ---------- STATE DRIVEN BY setInterval/setTimeout/Firestore ----------
     These MUST be signals. A timer or network callback runs outside any
     Angular-tracked event, so a plain field write here would silently
     update the class but never trigger a re-render under zoneless change
     detection. Signal writes always notify Angular's renderer, zoneless
     or not — which is also why the *content* itself (synced live from
     Firestore, i.e. from other people's browsers) has to live in signals
     too, not the plain fields the original version used. */
  isLoggedIn = signal(false);
  isLoading = signal(false);
  loadingProgress = signal(0);
  loadingStatusText = signal('INITIATING SWECHA INTERFACE');
  bootLines = signal<string[]>([]);
  scrollProgress = signal(0);
  glitchActive = signal(false);

  /** false = logo sits centered on screen; true = docked into the top-left HUD. */
  logoDocked = signal(false);

  private loadingTimer: any = null;
  private dockTimer: any = null;
  private readonly loadingStatusSteps = [
    'INITIATING SWECHA INTERFACE',
    'AUTH HANDSHAKE IN PROGRESS',
    'DECRYPTING STORY PACKETS',
    'CALIBRATING VISUAL CORTEX',
    'SESSION STABILIZING'
  ];
  private readonly bootFeedLines = [
    '> SWECHA_OS: cold boot',
    '> identity layer: waking',
    '> credential stream: detected',
    '> narrative packets: loading',
    '> visual cortex: calibrating',
    '> session handshake: complete'
  ];

  /* ---------- NOISE CANVAS ---------- */
  @ViewChild('noiseCanvas') noiseCanvasRef?: ElementRef<HTMLCanvasElement>;
  private noiseCtx: CanvasRenderingContext2D | null = null;
  private noiseRafId: number | null = null;
  private noiseLastTs = 0;
  private noiseCanvasBound = false;

  /* ---------- SCROLL-REVEAL FOR SECTIONS ---------- */
  private revealObserver: IntersectionObserver | null = null;
  private revealBound = false;

  /* ---------- ID COUNTER FOR NEW ITEMS ---------- */
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
     CONTENT — now signals. Local seed values below are only the
     *fallback* shown before the first Firestore snapshot arrives
     (or if Firestore is unreachable). Once connected, every
     viewer's copy of these signals is kept in sync by the effect
     in the constructor. Admin edits are written back to Firestore
     in saveSection(), which is called when a section's "Done
     editing" / "SAVE" button is pressed.
     ========================================================= */

  logline = signal(
    'A city on the edge of collapse. A platform that promises freedom. ' +
      'SWECHA follows one operator who discovers the system she trusts is the one erasing her.'
  );

  synopsis = signal(
    'Set in the near-future sprawl of Bhagyanagaram, SWECHA is a serialized thriller about ' +
      'surveillance, identity, and the cost of staying logged in. As the city\u2019s last independent network ' +
      'goes dark, our protagonist must decide whether to burn the system down or become part of it.'
  );

  episodes = signal<Episode[]>([
    {
      id: 1,
      title: 'EP 01 — WAKE',
      text: 'The system boots. Our protagonist logs in for what she believes is a routine shift, unaware the network has already flagged her.',
      image: 'https://placehold.co/500x700/0a0000/ff163d?text=EP+01'
    },
    {
      id: 2,
      title: 'EP 02 — SIGNAL',
      text: 'A corrupted broadcast surfaces from outside the grid. It speaks her name.',
      image: 'https://placehold.co/500x700/0a0000/00f7ff?text=EP+02'
    },
    {
      id: 3,
      title: 'EP 03 — BREACH',
      text: 'Trust fractures inside the platform as the walls between user and system dissolve.',
      image: 'https://placehold.co/500x700/0a0000/9b35ff?text=EP+03'
    }
  ]);

  characters = signal<CharacterEntry[]>([
    {
      id: 1,
      name: 'ARYA NAIR',
      role: 'Protagonist / Operator',
      description: 'A network technician who begins to suspect the platform she maintains is watching more than it protects.',
      photo: 'https://placehold.co/400x500/0a0000/ff163d?text=ARYA'
    },
    {
      id: 2,
      name: 'THE ARCHITECT',
      role: 'Antagonist / System Voice',
      description: 'Unseen and omnipresent, the Architect built SWECHA to save the city — and never asked what it would cost.',
      photo: 'https://placehold.co/400x500/0a0000/00f7ff?text=ARCHITECT'
    },
    {
      id: 3,
      name: 'KABIR RAO',
      role: 'Ally / Signal Runner',
      description: 'A former operator living off-grid, feeding Arya fragments of the truth from outside the system.',
      photo: 'https://placehold.co/400x500/0a0000/49ff69?text=KABIR'
    }
  ]);

  moodBoard = signal<MoodImage[]>([
    { id: 1, src: 'https://placehold.co/600x400/0a0000/ff163d?text=MOOD+01', caption: 'Neon-soaked skyline' },
    { id: 2, src: 'https://placehold.co/600x400/0a0000/00f7ff?text=MOOD+02', caption: 'Terminal interiors' },
    { id: 3, src: 'https://placehold.co/600x400/0a0000/9b35ff?text=MOOD+03', caption: 'Signal interference' },
    { id: 4, src: 'https://placehold.co/600x400/0a0000/ff2aa8?text=MOOD+04', caption: 'Crowd surveillance' }
  ]);

  technicalities = signal<TechItem[]>([
    {
      id: 1,
      image: 'https://placehold.co/400x700/0a0000/ff163d?text=TECH+01',
      heading: 'FORMAT',
      text: 'An 8-episode limited series, 30–40 minutes per episode, shot in a hybrid of practical neon lighting and desaturated urban exteriors.',
      links: [{ id: 1, label: 'Series Bible (PDF)', url: 'https://example.com/series-bible' }]
    },
    {
      id: 2,
      image: 'https://placehold.co/400x700/0a0000/00f7ff?text=TECH+02',
      heading: 'VISUAL LANGUAGE',
      text: 'Glitch and scanline motifs are diegetic — every distortion on screen represents the system itself reacting to the story.',
      links: []
    }
  ]);

  directorsNotesText = signal(
    'SWECHA started as a question: what happens when the platform meant to protect a city ' +
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

  aboutMe = signal<{ photo: string; bio: string; links: AboutLink[] }>({
    photo: 'https://placehold.co/400x500/0a0000/ff163d?text=DIRECTOR',
    bio: 'I\u2019m a writer-director working at the intersection of thriller and speculative fiction. SWECHA is my ' +
      'first serialized project, built from years of watching how cities and platforms quietly reshape each other.',
    links: [
      { id: 1, label: 'Portfolio', url: 'https://example.com' },
      { id: 2, label: 'Contact', url: 'mailto:hello@example.com' }
    ]
  });

  constructor() {
    // Mirrors Firestore -> local signals for every viewer. Skips a section
    // while its own admin is mid-edit so a remote update can't clobber
    // what they're currently typing.
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
    });

    // First client to connect seeds Firestore with the local defaults above,
    // so the site isn't blank for everyone before an admin has saved anything.
    effect(() => {
      if (this.content.ready() && !this.content.content()) {
        this.content.seedIfEmpty(this.snapshotContent());
      }
    });
  }

  /** Builds the full-content object Firestore expects, from current signal values. */
  private snapshotContent(): SwechaContent {
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
      aboutMe: this.aboutMe()
    };
  }

  /** Pushes just the fields for one section up to Firestore. */
  private saveSection(section: string): void {
    let partial: Partial<SwechaContent> | null = null;
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
        partial = { characters: this.characters() };
        break;
      case 'moodboard':
        partial = { moodBoard: this.moodBoard() };
        break;
      case 'technicalities':
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
  }

  private initRevealObserver(slides: NodeListOf<Element>): void {
    this.revealObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.18 }
    );
    slides.forEach(slide => this.revealObserver!.observe(slide));
  }

  /* =========================================================
     SCROLL PROGRESS
     ========================================================= */
  @HostListener('window:scroll')
  onWindowScroll(): void {
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop;
    const max = doc.scrollHeight - doc.clientHeight;
    this.scrollProgress.set(max > 0 ? Math.min(100, (scrollTop / max) * 100) : 0);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.resizeNoiseCanvas();
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
    this.isLoggedIn.set(false);
    this.isLoading.set(false);
    this.logoDocked.set(false);
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

  private startLoadingSequence(): void {
    this.isLoading.set(true);
    this.loadingProgress.set(0);
    this.bootLines.set([]);
    this.loadingStatusText.set(this.loadingStatusSteps[0]);
    let statusIndex = 0;
    let bootIndex = 0;

    this.loadingTimer = setInterval(() => {
      const next = this.loadingProgress() + 6 + Math.random() * 14;
      this.loadingProgress.set(Math.min(next, 100));

      const statusThreshold = Math.floor((this.loadingProgress() / 100) * this.loadingStatusSteps.length);
      if (statusThreshold > statusIndex && statusThreshold < this.loadingStatusSteps.length) {
        statusIndex = statusThreshold;
        this.loadingStatusText.set(this.loadingStatusSteps[statusIndex]);
      }

      if (bootIndex < this.bootFeedLines.length && Math.random() > 0.45) {
        this.bootLines.update(lines => [...lines, this.bootFeedLines[bootIndex]]);
        bootIndex += 1;
      }

      if (this.loadingProgress() >= 100) {
        this.loadingStatusText.set('SESSION STABILIZED');
        clearInterval(this.loadingTimer);
        setTimeout(() => {
          this.isLoading.set(false);
          this.isLoggedIn.set(true);
          this.logoDocked.set(false); // logo starts centered, full size
          this.triggerGlitch();

          // Hold the logo centered for a beat, then send it to the HUD
          // corner — the same beat the reference site's preloader uses
          // before its mark settles into the nav bar.
          this.dockTimer = setTimeout(() => {
            this.logoDocked.set(true);
          }, 700);
        }, 450);
      }
    }, 220);
  }

  /* =========================================================
     GLITCH TRANSITION PULSE
     ========================================================= */
  triggerGlitch(): void {
    this.glitchActive.set(false);
    setTimeout(() => {
      this.glitchActive.set(true);
      setTimeout(() => this.glitchActive.set(false), 480);
    }, 20);
  }

  /* =========================================================
     NOISE CANVAS (ambient static overlay — pure DOM/canvas,
     no template bindings, so no signals needed here)
     ========================================================= */
  private initNoiseCanvas(): void {
    const canvas = this.noiseCanvasRef?.nativeElement;
    if (!canvas) return;
    this.noiseCtx = canvas.getContext('2d', { alpha: true });
    this.resizeNoiseCanvas();

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
      this.noiseRafId = requestAnimationFrame(this.drawNoise);
    }
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
     GENERIC EDIT / IMAGE HELPERS
     ========================================================= */
  toggleEdit(section: string): void {
    const wasEditing = this.editing[section];
    this.editing[section] = !wasEditing;
    if (wasEditing) {
      // Turning edit mode OFF = "Save" for this section.
      this.saveSection(section);
    }
  }

  /** Reads a selected local file, uploads it to Firebase Storage, and writes
   *  the resulting download URL onto target[field]. Falls back to a local
   *  base64 preview immediately so the UI doesn't feel stalled during upload. */
  onImageChange(event: Event, target: any, field: string): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    const reader = new FileReader();
    reader.onload = () => {
      target[field] = reader.result as string; // instant local preview
    };
    reader.readAsDataURL(file);

    this.content
      .uploadImage(file, field)
      .then(url => {
        target[field] = url; // swap in the real, shareable URL
      })
      .catch(err => console.error('Image upload failed:', err));

    input.value = '';
  }

  /* ---------- EPISODES ---------- */
  addEpisode(): void {
    this.episodes.update(list => [
      ...list,
      {
        id: this.nextId(),
        title: 'NEW EPISODE',
        text: 'Episode description goes here.',
        image: 'https://placehold.co/500x700/0a0000/ff163d?text=NEW'
      }
    ]);
  }
  removeEpisode(id: number): void {
    this.episodes.update(list => list.filter(e => e.id !== id));
  }

  /* ---------- CHARACTERS ---------- */
  addCharacter(): void {
    this.characters.update(list => [
      ...list,
      {
        id: this.nextId(),
        name: 'NEW CHARACTER',
        role: 'Role',
        description: 'Character description goes here.',
        photo: 'https://placehold.co/400x500/0a0000/ff163d?text=NEW'
      }
    ]);
  }
  removeCharacter(id: number): void {
    this.characters.update(list => list.filter(c => c.id !== id));
  }

  /* ---------- MOOD BOARD ---------- */
  addMoodImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const tempId = this.nextId();

    const reader = new FileReader();
    reader.onload = () => {
      this.moodBoard.update(list => [...list, { id: tempId, src: reader.result as string, caption: '' }]);
    };
    reader.readAsDataURL(file);

    this.content
      .uploadImage(file, 'moodboard')
      .then(url => {
        this.moodBoard.update(list => list.map(m => (m.id === tempId ? { ...m, src: url } : m)));
      })
      .catch(err => console.error('Image upload failed:', err));

    input.value = '';
  }
  removeMoodImage(id: number): void {
    this.moodBoard.update(list => list.filter(m => m.id !== id));
  }

  /* ---------- TECHNICALITIES ---------- */
  addTechItem(): void {
    this.technicalities.update(list => [
      ...list,
      {
        id: this.nextId(),
        image: 'https://placehold.co/400x700/0a0000/ff163d?text=NEW',
        heading: 'NEW SECTION',
        text: 'Details go here.',
        links: []
      }
    ]);
  }
  removeTechItem(id: number): void {
    this.technicalities.update(list => list.filter(t => t.id !== id));
  }
  addTechLink(item: TechItem): void {
    item.links.push({ id: this.nextId(), label: 'New Link', url: 'https://example.com' });
  }
  removeTechLink(item: TechItem, linkId: number): void {
    item.links = item.links.filter(l => l.id !== linkId);
  }

  /* ---------- DIRECTOR'S NOTES ---------- */
  addDirectorsImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const tempId = this.nextId();

    const reader = new FileReader();
    reader.onload = () => {
      this.directorsNotesImages.update(list => [...list, { id: tempId, src: reader.result as string, caption: '' }]);
    };
    reader.readAsDataURL(file);

    this.content
      .uploadImage(file, 'directors-notes')
      .then(url => {
        this.directorsNotesImages.update(list => list.map(i => (i.id === tempId ? { ...i, src: url } : i)));
      })
      .catch(err => console.error('Image upload failed:', err));

    input.value = '';
  }
  removeDirectorsImage(id: number): void {
    this.directorsNotesImages.update(list => list.filter(i => i.id !== id));
  }
  addArticle(): void {
    this.articles.update(list => [
      ...list,
      {
        id: this.nextId(),
        title: 'New Article',
        description: 'Article description goes here.',
        link: 'https://example.com',
        image: 'https://placehold.co/300x180/0a0000/00f7ff?text=NEW'
      }
    ]);
  }
  removeArticle(id: number): void {
    this.articles.update(list => list.filter(a => a.id !== id));
  }

  /* ---------- ABOUT ME ---------- */
  addAboutLink(): void {
    this.aboutMe.update(a => ({ ...a, links: [...a.links, { id: this.nextId(), label: 'New Link', url: 'https://example.com' }] }));
  }
  removeAboutLink(id: number): void {
    this.aboutMe.update(a => ({ ...a, links: a.links.filter(l => l.id !== id) }));
  }

  /* ---------- MISC ---------- */
  trackById(_index: number, item: { id: number }): number {
    return item.id;
  }
}