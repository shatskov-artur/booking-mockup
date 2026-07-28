/* =============================================================================
   data.js — ЕДИНСТВЕННОЕ место с услугами, ценами и контактами.
   Чтобы подставить реальный прайс клиентки — правим только этот файл.
   Названия услуг лежат в i18n.js по ключу `key` (иначе при смене языка
   прайс остался бы польским).
   ============================================================================= */

/* Услуги. price — злотые, duration — минуты.
   Цены — ПРАВДОПОДОБНЫЕ ЗАГЛУШКИ по польскому рынку. Реальные — после интервью.
   Мастер правит их в админке (раздел «Usługi»); правки живут в localStorage.
     key    — ключ названия в i18n (у добавленных вручную вместо него title)
     active — выключенная услуга не показывается на сайте и в записи */
const SERVICES = [
  { id: 'klasyczny',    key: 'srv_classic',    price: 80,  duration: 60,  active: true },
  { id: 'hybrydowy',    key: 'srv_hybrid',     price: 130, duration: 90,  active: true },
  { id: 'przedluzanie', key: 'srv_extensions', price: 180, duration: 150, active: true },
  { id: 'pedicure',     key: 'srv_pedicure',   price: 150, duration: 90,  active: true },
];

/* Данные салона. Всё в квадратных скобках — заглушки под реальные данные. */
const SALON = {
  masterName: '[IMIĘ NAZWISKO]',
  brandName: 'Studio Paznokci',
  phone: '+48 000 000 000',
  email: 'kontakt@example.pl',
  address: '[ULICA I NUMER], [MIASTO]',
  instagram: '@[NAZWA_PROFILU]',
  hours: { from: 9, to: 19 },   // рабочие часы по умолчанию (переопределяются в SCHEDULE)
  workdays: [1, 2, 3, 4, 5, 6], // пн-сб (0 = вс, выходной) — базовое значение
  slotStep: 30,                 // шаг сетки слотов в минутах
  daysAhead: 14,                // на сколько дней вперёд открыта запись
  retentionMonths: 24,          // срок хранения данных для блока RODO
  /* Сколько визитов в день считать полной загрузкой — от этого зависит
     цвет дня в календаре админки. */
  dayCapacity: 5,
};

/* График работы по дням недели. Индекс = getDay() (0 = вс).
   Мастер правит его в админке, разделе «Grafik». */
const SCHEDULE = [
  { day: 0, open: false, from: 9,  to: 19 },   // вс
  { day: 1, open: true,  from: 9,  to: 19 },   // пн
  { day: 2, open: true,  from: 9,  to: 19 },
  { day: 3, open: true,  from: 9,  to: 19 },
  { day: 4, open: true,  from: 9,  to: 20 },   // чт — работает дольше
  { day: 5, open: true,  from: 9,  to: 19 },
  { day: 6, open: true,  from: 10, to: 16 },   // сб — короткий день
];

/* Блокировки: отпуск, обед, личные дела. day — смещение от сегодня.
   from/to в формате 'HH:MM'; если null — заблокирован весь день. */
const BLOCKS = [
  { id: 1, day: 2, from: '13:00', to: '14:00', reason: 'Przerwa' },
  { id: 2, day: 9, from: null,    to: null,    reason: 'Urlop' },
  { id: 3, day: 10, from: null,   to: null,    reason: 'Urlop' },
];

/* Галерея. Пока это CSS-градиенты вместо фото — макет работает оффлайн.
   Мастер добавляет реальные фото в админке (раздел «Galeria»), они лежат
   в localStorage как data URL. Поля:
     id        — для удаления/архива/порядка
     key       — ключ подписи в i18n (у загруженных фото вместо него title)
     gradient  — заглушка вместо фото
     src       — data URL загруженного фото (если есть, показываем его)
     serviceId — к какой услуге относится работа (null = ко всем)
     archived  — в архиве: на сайте не видно, но не удалено */
const GALLERY = [
  { id: 1, key: 'gal_french',  gradient: 'linear-gradient(135deg,#FDF2F8 0%,#FBCFE8 55%,#F9A8D4 100%)', src: null, serviceId: 'klasyczny',    archived: false },
  { id: 2, key: 'gal_ombre',   gradient: 'linear-gradient(135deg,#F5D0FE 0%,#D8B4FE 50%,#A78BFA 100%)', src: null, serviceId: 'hybrydowy',    archived: false },
  { id: 3, key: 'gal_nude',    gradient: 'linear-gradient(135deg,#FAF0E6 0%,#E8D5C4 55%,#D2B48C 100%)', src: null, serviceId: 'klasyczny',    archived: false },
  { id: 4, key: 'gal_glitter', gradient: 'linear-gradient(135deg,#FFF7E0 0%,#F0D98C 45%,#C9A227 100%)', src: null, serviceId: 'przedluzanie', archived: false },
  { id: 5, key: 'gal_red',     gradient: 'linear-gradient(135deg,#FEE2E2 0%,#F87171 55%,#B91C1C 100%)', src: null, serviceId: 'hybrydowy',    archived: false },
  { id: 6, key: 'gal_marble',  gradient: 'linear-gradient(135deg,#FFFFFF 0%,#E5E7EB 45%,#9CA3AF 100%)', src: null, serviceId: 'przedluzanie', archived: false },
  { id: 7, key: 'gal_pastel',  gradient: 'linear-gradient(135deg,#DBEAFE 0%,#C7D2FE 50%,#BFDBFE 100%)', src: null, serviceId: 'pedicure',     archived: false },
  { id: 8, key: 'gal_matte',   gradient: 'linear-gradient(135deg,#3F3F46 0%,#27272A 55%,#18181B 100%)', src: null, serviceId: null,           archived: true  },
];

/* Пароль на админку. ВНИМАНИЕ: это НЕ защита — код открыт, пароль виден
   в исходнике страницы. Нужен только чтобы случайный человек по ссылке
   не попал в панель. Реальная авторизация появится в версии с бэкендом. */
const ADMIN_PASS = 'paznokcie2026';

/* Ограничения для загрузки фото: localStorage ~5 МБ, поэтому картинки
   сжимаем через canvas до этих размеров перед сохранением. */
const PHOTO = {
  maxSide: 1000,      // максимальная сторона в пикселях
  quality: 0.72,      // качество JPEG
  maxFiles: 30,       // разумный предел для макета
};

/* Фейковые записи для админки. day — смещение в днях от сегодня.
   status: 'pending' | 'confirmed' | 'cancelled'
   Разброс по всему месяцу и разная плотность по дням — чтобы в календаре
   было видно градацию загруженности (свободно / средне / полный день). */
const FAKE_APPOINTMENTS = [
  /* сегодня — плотный день */
  { id: 1,  day: 0, time: '09:00', serviceId: 'hybrydowy',    client: 'Anna Kowalska',      phone: '+48 601 234 567', status: 'confirmed' },
  { id: 2,  day: 0, time: '11:00', serviceId: 'klasyczny',    client: 'Magdalena Nowak',    phone: '+48 602 345 678', status: 'pending'   },
  { id: 3,  day: 0, time: '13:00', serviceId: 'pedicure',     client: 'Karolina Wiśniewska',phone: '+48 603 456 789', status: 'confirmed' },
  { id: 4,  day: 0, time: '16:00', serviceId: 'przedluzanie', client: 'Oksana Melnyk',      phone: '+48 604 567 890', status: 'pending'   },
  /* +1 — средне */
  { id: 5,  day: 1, time: '10:00', serviceId: 'hybrydowy',    client: 'Julia Lewandowska',  phone: '+48 605 678 901', status: 'confirmed' },
  { id: 6,  day: 1, time: '14:30', serviceId: 'klasyczny',    client: 'Ewa Zielińska',      phone: '+48 606 789 012', status: 'pending'   },
  /* +2 */
  { id: 7,  day: 2, time: '09:30', serviceId: 'pedicure',     client: 'Natalia Wójcik',     phone: '+48 607 890 123', status: 'confirmed' },
  { id: 8,  day: 2, time: '12:00', serviceId: 'hybrydowy',    client: 'Sofia Kravchenko',   phone: '+48 608 901 234', status: 'cancelled' },
  { id: 9,  day: 2, time: '15:30', serviceId: 'klasyczny',    client: 'Beata Krawczyk',     phone: '+48 613 456 789', status: 'confirmed' },
  /* +3 — свободный день, одна запись */
  { id: 10, day: 3, time: '15:00', serviceId: 'przedluzanie', client: 'Alicja Dąbrowska',   phone: '+48 609 012 345', status: 'pending'   },
  /* +4 */
  { id: 11, day: 4, time: '11:30', serviceId: 'klasyczny',    client: 'Marta Szymańska',    phone: '+48 610 123 456', status: 'confirmed' },
  { id: 12, day: 4, time: '14:00', serviceId: 'hybrydowy',    client: 'Zofia Pawlak',       phone: '+48 614 567 890', status: 'confirmed' },
  /* +5 — полный день */
  { id: 13, day: 5, time: '09:00', serviceId: 'hybrydowy',    client: 'Weronika Kaczmarek', phone: '+48 611 234 567', status: 'pending'   },
  { id: 14, day: 5, time: '11:00', serviceId: 'klasyczny',    client: 'Aleksandra Mazur',   phone: '+48 615 678 901', status: 'confirmed' },
  { id: 15, day: 5, time: '13:00', serviceId: 'pedicure',     client: 'Kateryna Bondar',    phone: '+48 616 789 012', status: 'confirmed' },
  { id: 16, day: 5, time: '15:00', serviceId: 'przedluzanie', client: 'Monika Grabowska',   phone: '+48 617 890 123', status: 'pending'   },
  /* +6 */
  { id: 17, day: 6, time: '13:30', serviceId: 'pedicure',     client: 'Iryna Shevchenko',   phone: '+48 612 345 678', status: 'confirmed' },
  /* вторая неделя */
  { id: 18, day: 8,  time: '10:00', serviceId: 'hybrydowy',    client: 'Patrycja Wróbel',   phone: '+48 618 901 234', status: 'confirmed' },
  { id: 19, day: 8,  time: '12:30', serviceId: 'klasyczny',    client: 'Dominika Adamczyk', phone: '+48 619 012 345', status: 'pending'   },
  { id: 20, day: 9,  time: '09:30', serviceId: 'przedluzanie', client: 'Olga Tkachenko',    phone: '+48 620 123 456', status: 'confirmed' },
  { id: 21, day: 10, time: '11:00', serviceId: 'pedicure',     client: 'Klaudia Michalska', phone: '+48 621 234 567', status: 'pending'   },
  { id: 22, day: 10, time: '14:00', serviceId: 'hybrydowy',    client: 'Agnieszka Król',    phone: '+48 622 345 678', status: 'confirmed' },
  { id: 23, day: 10, time: '16:30', serviceId: 'klasyczny',    client: 'Emilia Jankowska',  phone: '+48 623 456 789', status: 'confirmed' },
  { id: 24, day: 12, time: '10:30', serviceId: 'hybrydowy',    client: 'Wiktoria Nowicka',  phone: '+48 624 567 890', status: 'pending'   },
  /* третья неделя */
  { id: 25, day: 15, time: '09:00', serviceId: 'pedicure',     client: 'Halyna Koval',      phone: '+48 625 678 901', status: 'confirmed' },
  { id: 26, day: 15, time: '11:30', serviceId: 'klasyczny',    client: 'Sylwia Wieczorek',  phone: '+48 626 789 012', status: 'confirmed' },
  { id: 27, day: 16, time: '13:00', serviceId: 'przedluzanie', client: 'Barbara Sikora',    phone: '+48 627 890 123', status: 'pending'   },
  { id: 28, day: 17, time: '10:00', serviceId: 'hybrydowy',    client: 'Milena Baran',      phone: '+48 628 901 234', status: 'confirmed' },
  { id: 29, day: 18, time: '15:30', serviceId: 'klasyczny',    client: 'Renata Duda',       phone: '+48 629 012 345', status: 'pending'   },
  /* четвёртая неделя */
  { id: 30, day: 22, time: '11:00', serviceId: 'hybrydowy',    client: 'Tetiana Lysenko',   phone: '+48 630 123 456', status: 'confirmed' },
  { id: 31, day: 23, time: '09:30', serviceId: 'pedicure',     client: 'Justyna Cieślak',   phone: '+48 631 234 567', status: 'pending'   },
  { id: 32, day: 25, time: '14:00', serviceId: 'przedluzanie', client: 'Paulina Rutkowska', phone: '+48 632 345 678', status: 'confirmed' },

  /* Отменённые — в том числе в прошлом, иначе статистику отмен не собрать.
     Sofia Kravchenko и Klaudia Michalska отменяют повторно: на таких клиентках
     видно, с кого стоит брать депозит. */
  { id: 40, day: -18, time: '11:00', serviceId: 'przedluzanie', client: 'Sofia Kravchenko',   phone: '+48 608 901 234', status: 'cancelled' },
  { id: 41, day: -12, time: '14:00', serviceId: 'przedluzanie', client: 'Sofia Kravchenko',   phone: '+48 608 901 234', status: 'cancelled' },
  { id: 42, day: -9,  time: '10:00', serviceId: 'hybrydowy',    client: 'Klaudia Michalska',  phone: '+48 621 234 567', status: 'cancelled' },
  { id: 43, day: -5,  time: '16:00', serviceId: 'hybrydowy',    client: 'Klaudia Michalska',  phone: '+48 621 234 567', status: 'cancelled' },
  { id: 44, day: -14, time: '09:30', serviceId: 'przedluzanie', client: 'Dominika Adamczyk',  phone: '+48 619 012 345', status: 'cancelled' },
  { id: 45, day: -7,  time: '13:00', serviceId: 'pedicure',     client: 'Renata Duda',        phone: '+48 629 012 345', status: 'cancelled' },
  { id: 46, day: -3,  time: '15:30', serviceId: 'klasyczny',    client: 'Ewa Zielińska',      phone: '+48 606 789 012', status: 'cancelled' },
  { id: 47, day: -2,  time: '12:00', serviceId: 'przedluzanie', client: 'Milena Baran',       phone: '+48 628 901 234', status: 'cancelled' },
];

/* Темы оформления. Значения самих цветов — в styles.css по [data-theme]. */
const THEMES = [
  { id: 'pink',        key: 'theme_pink',        swatch: '#EC4899' },
  { id: 'nude',        key: 'theme_nude',        swatch: '#C4A484' },
  { id: 'olive',       key: 'theme_olive',       swatch: '#6B7F3A' },
  { id: 'terracotta',  key: 'theme_terracotta',  swatch: '#C0623F' },
  { id: 'dark',        key: 'theme_dark',        swatch: '#141210' },
];
