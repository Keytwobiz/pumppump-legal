// Animations et interactions du site de PumpPump. Les pages restent complètes
// sans JavaScript ; quand l'utilisateur réduit les animations, chaque effet
// affiche directement son état final.

(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // Un seul passage par image pour tout ce qui suit le défilement.
  const scrollTasks = [];
  let isScheduled = false;
  const runScrollTasks = () => {
    isScheduled = false;
    for (const task of scrollTasks) task();
  };
  const scheduleScrollTasks = () => {
    if (isScheduled) return;
    isScheduled = true;
    requestAnimationFrame(runScrollTasks);
  };
  window.addEventListener('scroll', scheduleScrollTasks, { passive: true });
  window.addEventListener('resize', scheduleScrollTasks);

  // En-tête flouté dès que la page défile.
  const header = document.querySelector('[data-header]');
  scrollTasks.push(() => header.classList.toggle('is-scrolled', window.scrollY > 8));

  // Menu des petits écrans.
  const menuButton = document.querySelector('[data-menu-button]');
  const menuLabel = menuButton.querySelector('.sr-only');
  const setMenu = (isOpen) => {
    root.classList.toggle('menu-open', isOpen);
    menuButton.setAttribute('aria-expanded', String(isOpen));
    menuLabel.textContent = isOpen ? 'Fermer le menu' : 'Ouvrir le menu';
  };
  menuButton.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenu(false);
  });
  for (const link of document.querySelectorAll('.mobile-menu a')) link.addEventListener('click', () => setMenu(false));
  window.matchMedia('(min-width: 761px)').addEventListener('change', (event) => {
    if (event.matches) setMenu(false);
  });

  // Apparition des blocs à l'entrée dans l'écran.
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
  );
  for (const element of document.querySelectorAll('[data-reveal]')) revealObserver.observe(element);

  // Téléphone de l'accueil qui s'incline vers le pointeur.
  const tilt = document.querySelector('[data-tilt]');
  if (tilt && finePointer && !reduceMotion) {
    const area = tilt.closest('section');
    area.addEventListener('pointermove', (event) => {
      const box = tilt.getBoundingClientRect();
      const x = clamp((event.clientX - box.left) / box.width - 0.5, -0.8, 0.8);
      const y = clamp((event.clientY - box.top) / box.height - 0.5, -0.8, 0.8);
      tilt.style.setProperty('--ry', `${x * 16}deg`);
      tilt.style.setProperty('--rx', `${-y * 10}deg`);
    });
    area.addEventListener('pointerleave', () => {
      tilt.style.setProperty('--ry', '0deg');
      tilt.style.setProperty('--rx', '0deg');
    });
  }

  // Halo des cartes qui suit le pointeur.
  if (finePointer) {
    for (const card of document.querySelectorAll('.card')) {
      card.addEventListener('pointermove', (event) => {
        const box = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${event.clientX - box.left}px`);
        card.style.setProperty('--my', `${event.clientY - box.top}px`);
      });
    }
  }

  // Montants qui défilent jusqu'à leur valeur.
  const formatEuros = (value) =>
    `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const countUp = (element) => {
    const target = Number(element.dataset.count);
    const delay = Number(element.dataset.countDelay || 0);
    const start = performance.now() + delay;
    const frame = (now) => {
      const progress = clamp((now - start) / 1400, 0, 1);
      element.textContent = formatEuros(target * (1 - Math.pow(1 - progress, 4)));
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  if (!reduceMotion) {
    const countObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          countObserver.unobserve(entry.target);
          countUp(entry.target);
        }
      },
      { threshold: 0.8 },
    );
    for (const element of document.querySelectorAll('[data-count]')) countObserver.observe(element);
  }

  // Sur la route : la voiture suit le tracé au rythme du défilement, passe aux
  // pompes et allume les étapes. Chaque repère porte sa part du trajet, de 0 au
  // départ à 1 à l'arrivée ; chaque dessin dit où commence et finit le trajet
  // sur son tracé.
  const road = document.querySelector('[data-road]');
  if (road) {
    const track = road.querySelector('[data-road-track]');
    const stops = [...road.querySelectorAll('[data-stop]')];
    const drawings = [...road.querySelectorAll('.road-svg')].map((svg) => {
      const path = svg.querySelector('[data-road-path]');
      const length = path.getTotalLength();
      const start = Number(svg.dataset.start);
      const end = Number(svg.dataset.end);
      const pointAt = (trip) => path.getPointAtLength(clamp(start + trip * (end - start), 0, 1) * length);
      const places = [...svg.querySelectorAll('[data-place]')];
      for (const place of places) {
        const at = Number(place.dataset.trip);
        const point = pointAt(at);
        const ahead = pointAt(at + 0.002);
        const angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) - Math.PI / 2;
        const offset = Number(place.dataset.offset || 0);
        place.setAttribute(
          'transform',
          `translate(${point.x + Math.cos(angle) * offset} ${point.y + Math.sin(angle) * offset})`,
        );
      }
      return {
        svg,
        pointAt,
        alongAt: (trip) => start + trip * (end - start),
        places,
        car: svg.querySelector('[data-car]'),
        trail: svg.querySelector('[data-trail]'),
      };
    });
    const update = () => {
      const box = track.getBoundingClientRect();
      const distance = box.height - window.innerHeight;
      // La voiture arrive un peu avant la fin du défilement, pour que l'arrivée reste à l'écran.
      const progress = reduceMotion ? 1 : distance > 0 ? clamp(-box.top / (distance * 0.9), 0, 1) : 0;
      for (const drawing of drawings) {
        if (drawing.svg.getClientRects().length === 0) continue;
        const point = drawing.pointAt(progress);
        const behind = drawing.pointAt(progress - 0.004);
        const ahead = drawing.pointAt(progress + 0.004);
        const angle = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI + 90;
        drawing.car.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
        drawing.trail.style.strokeDashoffset = String(1 - drawing.alongAt(progress));
        for (const place of drawing.places) place.classList.toggle('is-passed', progress >= Number(place.dataset.trip));
      }
      for (const stop of stops) stop.classList.toggle('is-passed', progress >= Number(stop.dataset.stop));
    };
    scrollTasks.push(update);
  }

  // Fonctionnalités : l'écran du téléphone suit l'étape lue.
  const story = document.querySelector('[data-story]');
  if (story) {
    const steps = [...story.querySelectorAll('[data-story-step]')];
    const screens = [...story.querySelectorAll('[data-screen]')];
    const activate = (index) => {
      steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
      screens.forEach((screen, i) => screen.classList.toggle('is-active', i === index));
    };
    const stepObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) activate(steps.indexOf(entry.target));
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const step of steps) stepObserver.observe(step);
    activate(0);
  }

  // À propos : les mots s'allument au fil de la lecture.
  const manifestos = [...document.querySelectorAll('[data-words]')].map((block) => {
    const words = [];
    for (const paragraph of block.querySelectorAll('p')) {
      const text = paragraph.textContent.trim().split(/\s+/);
      paragraph.textContent = '';
      text.forEach((word, i) => {
        const span = document.createElement('span');
        span.className = 'w';
        span.textContent = word;
        paragraph.append(span);
        if (i < text.length - 1) paragraph.append(' ');
        words.push(span);
      });
    }
    return { block, words };
  });
  if (manifestos.length > 0) {
    scrollTasks.push(() => {
      for (const { block, words } of manifestos) {
        const box = block.getBoundingClientRect();
        // Commence quand le texte entre par le bas, finit quand sa fin passe au milieu de l'écran.
        const range = window.innerHeight * 0.4 + box.height;
        const progress = reduceMotion ? 1 : clamp((window.innerHeight * 0.85 - box.top) / range, 0, 1);
        const lit = Math.round(progress * words.length);
        words.forEach((word, i) => word.classList.toggle('is-lit', i < lit));
      }
    });
  }

  // Copier l'adresse de l'assistance.
  for (const button of document.querySelectorAll('[data-copy]')) {
    const label = button.querySelector('[data-copy-label]');
    const initialLabel = label.textContent;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
      } catch {
        window.location.href = `mailto:${button.dataset.copy}`;
        return;
      }
      label.textContent = 'Adresse copiée';
      button.classList.add('is-done');
      setTimeout(() => {
        label.textContent = initialLabel;
        button.classList.remove('is-done');
      }, 2200);
    });
  }

  // Questions fréquentes : ouverture en douceur et recherche.
  const faqItems = [...document.querySelectorAll('.faq-item')];
  if (!reduceMotion) {
    for (const item of faqItems) {
      const summary = item.querySelector('summary');
      const answer = item.querySelector('.faq-answer');
      summary.addEventListener('click', (event) => {
        event.preventDefault();
        const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
        if (!item.open) {
          item.open = true;
          answer.animate([{ height: '0px', opacity: 0 }, { height: `${answer.offsetHeight}px`, opacity: 1 }], {
            duration: 420,
            easing,
          });
        } else {
          const closing = answer.animate(
            [{ height: `${answer.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }],
            { duration: 320, easing },
          );
          closing.onfinish = () => {
            item.open = false;
          };
        }
      });
    }
  }
  const search = document.querySelector('[data-faq-search]');
  if (search) {
    const normalize = (text) =>
      text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
    const texts = faqItems.map((item) => normalize(item.textContent));
    const groups = [...document.querySelectorAll('.faq-group')];
    const empty = document.querySelector('[data-faq-empty]');
    search.addEventListener('input', () => {
      const terms = normalize(search.value).split(/\s+/).filter(Boolean);
      faqItems.forEach((item, i) => {
        item.hidden = !terms.every((term) => texts[i].includes(term));
      });
      for (const group of groups) group.hidden = !group.querySelector('.faq-item:not([hidden])');
      empty.hidden = faqItems.some((item) => !item.hidden);
    });
  }

  // Documents légaux : sommaire qui suit la lecture et barre de progression.
  const toc = document.querySelector('[data-toc]');
  if (toc) {
    const list = toc.querySelector('ol');
    const links = [...toc.querySelectorAll('a')];
    const sections = links.map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))));
    const article = document.querySelector('.prose');
    const progressBar = document.querySelector('[data-progress]');
    let activeIndex = -1;
    scrollTasks.push(() => {
      let index = 0;
      sections.forEach((section, i) => {
        if (section.getBoundingClientRect().top < window.innerHeight * 0.3) index = i;
      });
      if (index !== activeIndex) {
        activeIndex = index;
        links.forEach((link, i) => link.classList.toggle('is-active', i === index));
        if (list.scrollWidth > list.clientWidth) {
          list.scrollTo({ left: links[index].offsetLeft - 24, behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      }
      const box = article.getBoundingClientRect();
      const read = clamp((window.innerHeight * 0.5 - box.top) / box.height, 0, 1);
      progressBar.style.setProperty('--p', read.toFixed(4));
    });
  }

  runScrollTasks();
})();
