import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Loader } from 'lucide-react';

// ==================== CONFIGURAÇÃO ====================
// INSTRUÇÕES: Após criar sua planilha no Google Sheets, cole o ID aqui
// Exemplo: Se o link for https://docs.google.com/spreadsheets/d/1ABC123/edit
// Cole apenas: 1ABC123
const SHEET_ID = '1QZewic2mbwaksGyIx5MN7mWTukQdxBOb2yheCydFdCM'; // ← COLE O ID DA SUA PLANILHA AQUI

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=`;

// IDs das abas (GIDs) - você vai descobrir esses números depois
const SHEET_GIDS = {
  calendar: '0',      // Normalmente a primeira aba é 0
  pricing: '53054799',
  rooms: '109166723',
  beds: '844940838',
  suites: '1830778583',
  extras: '1216063608'
};

// ==================== UTILITÁRIOS ====================
const parseLocalDate = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const formatLocalDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const formatCurrency = (value) => `R$ ${value.toFixed(2).replace('.', ',')}`;

const formatBRDate = (dateStr) => {
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const parseCSV = (csvText) => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] || '';
    });
    return obj;
  });
};

// Cache localStorage
const CACHE_KEY = 'freisa_sheets_cache';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

const getCachedData = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_DURATION) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

const setCachedData = (data) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn('Cache failed:', e);
  }
};

// ==================== HOOKS PERSONALIZADOS ====================
const useSheetsData = () => {
  const [data, setData] = useState({
    calendar: [],
    pricing: [],
    rooms: [],
    beds: [],
    suites: [],
    extras: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSheet = async (gid, retryCount = 0) => {
    if (!SHEET_ID) throw new Error('SHEET_ID não configurado');
    try {
      const url = `${SHEET_URL}${gid}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      return parseCSV(text);
    } catch (err) {
      if (retryCount < 1) {
        await new Promise(r => setTimeout(r, 1000));
        return fetchSheet(gid, retryCount + 1);
      }
      throw err;
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (!SHEET_ID) {
        setData({
          calendar: [], pricing: [], rooms: [
            { room_id: 'jb', name: 'Nice Place', type: 'dorm', max_guests: '14' },
            { room_id: 'ar', name: 'Quarto Feminino FreiSa', type: 'dorm', max_guests: '14' },
            { room_id: 'q007', name: 'Quarto Misto', type: 'dorm', max_guests: '14' },
            { room_id: 'q777', name: 'Suítes', type: 'suite', max_guests: '3' }
          ],
          beds: [], suites: [], extras: [
            { key: 'early_checkin', price: '30' },
            { key: 'late_checkout', price: '30' },
            { key: 'transfer_arrival', price: '150' },
            { key: 'transfer_departure', price: '150' },
            { key: 'base_price_nice_place', price: '100' },
            { key: 'base_price_quarto_feminino', price: '120' },
            { key: 'base_price_quarto_misto', price: '100' },
            { key: 'base_price_suites', price: '300' }
          ]
        });
        setIsLoading(false);
        return;
      }

      const cached = getCachedData();
      if (cached) {
        setData(cached);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const [calendar, pricing, rooms, beds, suites, extras] = await Promise.all([
          fetchSheet(SHEET_GIDS.calendar),
          fetchSheet(SHEET_GIDS.pricing),
          fetchSheet(SHEET_GIDS.rooms),
          fetchSheet(SHEET_GIDS.beds),
          fetchSheet(SHEET_GIDS.suites),
          fetchSheet(SHEET_GIDS.extras)
        ]);
        const newData = { calendar, pricing, rooms, beds, suites, extras };
        setData(newData);
        setCachedData(newData);
      } catch (err) {
        setError('Erro ao conectar com Google Sheets. Verifique a configuração.');
        setData(prev => prev); // leave defaults (already handled above in absence of SHEET_ID)
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  return { data, isLoading, error };
};

const useAvailability = (sheetsData, roomId, checkin, checkout) => {
  return useMemo(() => {
    if (!checkin || !checkout || !sheetsData.calendar.length) return { availableBeds: [], availableSuites: [], isAvailable: true };
    const start = parseLocalDate(checkin);
    const end = parseLocalDate(checkout);
    const dates = [];
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) dates.push(formatLocalDate(d));
    const blockedDates = sheetsData.calendar.filter(row =>
      row.room_id === roomId && dates.includes(row.date) && (row.status === 'reserved' || row.status === 'blocked')
    );
    if (blockedDates.length > 0) return { availableBeds: [], availableSuites: [], isAvailable: false };
    const availableBeds = [];
    if (roomId !== 'q777') {
      for (let i = 1; i <= 7; i++) {
        ['T', 'B'].forEach(pos => {
          const bedId = `C${i}-${pos}`;
          const isBooked = dates.some(date =>
            sheetsData.beds.some(bed =>
              bed.room_id === roomId && bed.date === date && bed.bed_id === bedId && bed.status === 'booked'
            )
          );
          if (!isBooked) availableBeds.push(bedId);
        });
      }
    }
    const availableSuites = [];
    if (roomId === 'q777') {
      ['S1', 'S2', 'S3'].forEach(suiteId => {
        const isBooked = dates.some(date =>
          sheetsData.suites.some(suite =>
            suite.date === date && suite.suite_id === suiteId && suite.status === 'booked'
          )
        );
        if (!isBooked) availableSuites.push(suiteId);
      });
    }
    return { availableBeds, availableSuites, isAvailable: true };
  }, [sheetsData, roomId, checkin, checkout]);
};

const getBasePrice = (sheetsData, roomId) => {
  const priceKeys = {
    jb: 'base_price_nice_place',
    ar: 'base_price_quarto_feminino',
    q007: 'base_price_quarto_misto',
    q777: 'base_price_suites'
  };
  const key = priceKeys[roomId];
  if (!key) return 100;
  const extraRow = sheetsData.extras.find(e => e.key === key);
  return extraRow ? parseFloat(extraRow.price) : 100;
};

const useDynamicPricing = (sheetsData, roomId, checkin, checkout, guests, selectedBeds, selectedSuites) => {
  return useMemo(() => {
    if (!checkin || !checkout) return { nightlyPrices: [], baseTotal: 0 };
    const start = parseLocalDate(checkin);
    const end = parseLocalDate(checkout);
    const nights = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    const nightlyPrices = [];
    let baseTotal = 0;
    for (let i = 0; i < nights; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const priceRow = sheetsData.pricing.find(p => p.room_id === roomId && p.date === dateStr);
      const pricePerUnit = priceRow ? parseFloat(priceRow.price) : getBasePrice(sheetsData, roomId);
      let nightTotal = roomId === 'q777' ? pricePerUnit * selectedSuites.length : pricePerUnit * guests;
      nightlyPrices.push({ date: dateStr, price: pricePerUnit, total: nightTotal });
      baseTotal += nightTotal;
    }
    return { nightlyPrices, baseTotal };
  }, [sheetsData, roomId, checkin, checkout, guests, selectedBeds, selectedSuites]);
};

// ==================== COMPONENTES ====================
const useCarousel = (images, interval = 5000) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  useEffect(() => {
    if (!isPaused && images.length > 1) {
      const timer = setInterval(() => setCurrentIndex(p => (p + 1) % images.length), interval);
      return () => clearInterval(timer);
    }
  }, [isPaused, images.length, interval]);
  return {
    currentIndex,
    next: () => setCurrentIndex(p => (p + 1) % images.length),
    prev: () => setCurrentIndex(p => (p - 1 + images.length) % images.length),
    goTo: (i) => setCurrentIndex(i),
    setIsPaused
  };
};

const Hero = () => {
  const images = [
    'https://i.imgur.com/JXIOXmJ.jpeg',
    'https://i.imgur.com/sjw1dGZ.jpeg',
    'https://i.imgur.com/ftDKRIH.jpeg',
    'https://i.imgur.com/YDrxJUS.jpeg'
  ];
  const { currentIndex, next, prev, goTo, setIsPaused } = useCarousel(images, 5000);
  const scrollToReservation = () => {
    const el = document.getElementById('reservation-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };
  const scrollToRooms = () => {
    const el = document.getElementById('rooms-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="hero" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
      {images.map((img, idx) => (
        <div key={idx} className="hero-slide" style={{
          backgroundImage: `url(${img})`,
          opacity: idx === currentIndex ? 1 : 0,
          transition: 'opacity 1.5s ease-in-out'
        }} />
      ))}
      <div className="hero-overlay" />
      <div className="hero-content">
        <h1>FreiSa Hostel</h1>
        <p>Hospitalidade Que Conecta Pessoas.</p>
        <div className="hero-buttons">
          <button className="btn-primary" onClick={scrollToReservation}>Reserve Aqui</button>
          <button className="btn-secondary" onClick={scrollToRooms}>Conheça Nossas Instalações</button>
        </div>
      </div>
      <button className="carousel-btn carousel-prev" onClick={prev} aria-label="Previous"><ChevronLeft size={32} /></button>
      <button className="carousel-btn carousel-next" onClick={next} aria-label="Next"><ChevronRight size={32} /></button>
      <div className="carousel-indicators">
        {images.map((_, idx) => (
          <button key={idx} className={`indicator ${idx === currentIndex ? 'active' : ''}`} onClick={() => goTo(idx)} aria-label={`Go to slide ${idx + 1}`} />
        ))}
      </div>
    </div>
  );
};

const RoomCard = ({ name, location, beds, bathrooms, images, description, highlights, onShowMore, hasCarousel = true }) => {
  const { currentIndex, next, prev, goTo } = useCarousel(images, 5000);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  return (
    <>
      <div className="room-card">
        <div className="room-header">{name}</div>
        <div className="room-carousel">
          <img src={hasCarousel ? images[currentIndex] : images[0]} alt={name} onClick={() => setLightboxOpen(true)} style={{ cursor: 'pointer' }} />
          {hasCarousel && images.length > 1 && (
            <>
              <button className="carousel-btn carousel-prev" onClick={prev}><ChevronLeft size={24} /></button>
              <button className="carousel-btn carousel-next" onClick={next}><ChevronRight size={24} /></button>
              <div className="carousel-indicators">
                {images.map((_, idx) => <button key={idx} className={`indicator ${idx === currentIndex ? 'active' : ''}`} onClick={() => goTo(idx)} />)}
              </div>
            </>
          )}
        </div>
        <div className="room-info">
          <p className="room-location">{location}</p>
          <p className="room-specs">{beds} camas · {bathrooms}</p>
          <div className="divider" />
          <div className="room-highlights">
            {highlights.map((h, i) => (
              <div key={i} className="highlight"><span className="highlight-icon">{h.icon}</span><div><strong>{h.title}</strong><p style={{margin:0,fontSize:'0.9rem',color:'#666'}}>{h.text}</p></div></div>
            ))}
          </div>
          <div className="divider" />
          <p className="room-description">{description.substring(0, 150)}...</p>
          <button className="btn-text" onClick={onShowMore}>Mostrar mais</button>
        </div>
      </div>
      {lightboxOpen && <Lightbox images={images} initialIndex={hasCarousel ? currentIndex : 0} onClose={() => setLightboxOpen(false)} />}
    </>
  );
};

const Lightbox = ({ images, initialIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  useEffect(() => {
    const handleEscape = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose}><X size={32} /></button>
      <img src={images[currentIndex]} alt="" onClick={(e) => e.stopPropagation()} />
      <button className="carousel-btn carousel-prev" onClick={(e) => { e.stopPropagation(); setCurrentIndex(p => (p - 1 + images.length) % images.length); }}><ChevronLeft size={32} /></button>
      <button className="carousel-btn carousel-next" onClick={(e) => { e.stopPropagation(); setCurrentIndex(p => (p + 1) % images.length); }}><ChevronRight size={32} /></button>
    </div>
  );
};

const BenefitsSection = () => {
  const benefits = [
    { icon: '📍', title: 'Localização Estratégica', text: 'Em Copacabana, perto de tudo que você precisa' },
    { icon: '💰', title: 'Excelente Custo-Benefício', text: 'Preços justos para uma experiência incrível' },
    { icon: '🔒', title: 'Conforto e Segurança', text: 'Sua estadia tranquila é nossa prioridade' },
    { icon: '🤝', title: 'Ambiente Social', text: 'Conheça viajantes do mundo todo' },
    { icon: '🍳', title: 'Estrutura Prática', text: 'Cozinha compartilhada e áreas comuns' },
    { icon: '🌳', title: 'Experiência Carioca', text: 'Viva o Rio de Janeiro autenticamente' }
  ];
  return (
    <section className="benefits-section">
      <h2>Por Que Escolher o FreiSa Hostel?</h2>
      <div className="benefits-grid">{benefits.map((b, i) => <div key={i} className="benefit-card"><div className="benefit-icon">{b.icon}</div><h3>{b.title}</h3><p>{b.text}</p></div>)}</div>
    </section>
  );
};

const TestimonialsSection = () => {
  const testimonials = [
    { text: 'Fiquei 4 noites em Copacabana. Localização excelente — mercados, padarias e bares na mesma rua; a apenas 2 minutos da praia...', name: 'Hóspede', location: 'Brasil' },
    { text: 'Minha hospedagem foi super tranquila. A um quarteirão da praia e perto do SESC Copacabana...', name: 'Hóspede', location: 'Internacional' },
    { text: 'Localização excelente; o proprietário estava disponível sempre que precisei...', name: 'Hóspede', location: 'São Paulo' }
  ];
  return (
    <section className="testimonials-section">
      <h2>O Que Dizem Nossos Hóspedes</h2>
      <div className="testimonials-grid">{testimonials.map((t, i) => <div key={i} className="testimonial-card"><p className="testimonial-text">"{t.text}"</p><div className="testimonial-author"><div className="author-avatar">{t.name[0]}</div><div><div className="author-name">{t.name}</div><div className="author-location">{t.location}</div></div></div><div className="testimonial-stars">★★★★★</div></div>)}</div>
      <p className="testimonials-note">Todas as referências foram editadas para clareza.</p>
    </section>
  );
};

// ==================== CALENDAR MODAL (FIXED MOBILE FULLSCREEN BEHAVIOR) ====================
const CalendarModal = ({ onClose, onSelectDate, sheetsData, roomId, selectedDate }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const today = new Date(); today.setHours(0,0,0,0);
  const modalRef = useRef(null);
  const headerRef = useRef(null);
  const dayNamesRef = useRef(null);

  // Detect mobile / small screens to force fullscreen behavior
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Prevent background scrolling and apply topmost z-index when modal is open in fullscreen
  useEffect(() => {
    if (!isMobile) return;
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = prevBodyOverflow || '';
      document.documentElement.style.overscrollBehavior = '';
    };
  }, [isMobile]);

  const createLocalDate = (year, month0Based, day) => new Date(year, month0Based, day);
  const formatDateToYYYYMMDD = (year, month0Based, day) => `${year}-${String(month0Based + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  const days = getDaysInMonth(currentDate);
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const prevMonth = () => setCurrentDate(p => new Date(p.getFullYear(), p.getMonth() - 1));
  const nextMonth = () => setCurrentDate(p => new Date(p.getFullYear(), p.getMonth() + 1));

  const getPrice = (day) => {
    if (!day) return 0;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const dateStr = formatDateToYYYYMMDD(year, month, day);
    const priceRow = sheetsData.pricing.find(p => p.room_id === roomId && p.date === dateStr);
    return priceRow ? parseFloat(priceRow.price) : getBasePrice(sheetsData, roomId);
  };

  const isReserved = (day) => {
    if (!day) return false;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const dateStr = formatDateToYYYYMMDD(year, month, day);
    return sheetsData.calendar.some(row => row.room_id === roomId && row.date === dateStr && (row.status === 'reserved' || row.status === 'blocked'));
  };

  const handleDateClick = (day) => {
    if (!day) return;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const localDate = createLocalDate(year, month, day);
    localDate.setHours(0,0,0,0);
    const todayLocal = new Date(); todayLocal.setHours(0,0,0,0);
    const dateStr = formatDateToYYYYMMDD(year, month, day);
    if (!isReserved(day) && localDate.getTime() >= todayLocal.getTime()) onSelectDate(dateStr);
  };

  // Key fix: compute appropriate row height so all weeks fit into viewport on mobile fullscreen
  useEffect(() => {
    const computeRowHeight = () => {
      if (!modalRef.current || !headerRef.current || !dayNamesRef.current) return;
      const vh = window.innerHeight;
      const headerRect = headerRef.current.getBoundingClientRect();
      const dayNamesRect = dayNamesRef.current.getBoundingClientRect();
      // safe area insets are handled via CSS padding; subtract small buffer 24
      const available = Math.max(200, vh - headerRect.height - dayNamesRect.height - 24);
      // weeks count: number of rows of days (not counting day names). days.length includes leading nulls.
      const weeks = Math.ceil(days.length / 7);
      const rowHeight = Math.floor(available / weeks);
      // set variables used by CSS
      modalRef.current.style.setProperty('--calendar-row-height', `${rowHeight}px`);
      modalRef.current.style.setProperty('--calendar-header-height', `${Math.ceil(headerRect.height)}px`);
    };
    // compute now and on resize/orientation change
    computeRowHeight();
    window.addEventListener('resize', computeRowHeight);
    window.addEventListener('orientationchange', computeRowHeight);
    return () => {
      window.removeEventListener('resize', computeRowHeight);
      window.removeEventListener('orientationchange', computeRowHeight);
    };
  }, [days, isMobile, currentDate]);

  const PREV_IMG = 'https://i.imgur.com/C9GoK9i.png';
  const NEXT_IMG = 'https://i.imgur.com/xcG2Lyf.png';
  const CLOSE_IMG = 'https://i.imgur.com/V3bCqJd.png';

  return (
    <div className="modal-overlay calendar-overlay" onClick={onClose} aria-hidden={false}>
      <div
        ref={modalRef}
        className={`modal-content calendar-modal ${isMobile ? 'fullscreen' : ''}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Calendário de seleção de datas"
        translate="no"
      >
        <div className="calendar-header" ref={headerRef}>
          <button onClick={prevMonth} aria-label="Mês anterior">
            <img src={PREV_IMG} alt="Anterior" className="calendar-icon" />
          </button>
          <h3>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h3>
          <div className="header-right">
            <button onClick={nextMonth} aria-label="Próximo mês">
              <img src={NEXT_IMG} alt="Próximo" className="calendar-icon" />
            </button>
            <button className="modal-close small" onClick={onClose} aria-label="Fechar calendário">
              <img src={CLOSE_IMG} alt="Fechar" className="calendar-icon close-icon" />
            </button>
          </div>
        </div>

        <div className="calendar-body" style={{ touchAction: 'manipulation' }}>
          <div className="calendar-grid" role="grid" aria-label="Calendário">
            <div ref={dayNamesRef} className="calendar-day-names" style={{ display: 'contents' }}>
              {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
                <div key={d} className="calendar-day-name" role="columnheader">{d}</div>
              ))}
            </div>
            {days.map((day, idx) => {
              if (!day) return <div key={idx} className="calendar-day empty" />;
              const year = currentDate.getFullYear();
              const month = currentDate.getMonth();
              const date = createLocalDate(year, month, day); date.setHours(0,0,0,0);
              const dateStr = formatDateToYYYYMMDD(year, month, day);
              const reserved = isReserved(day);
              const todayLocal = new Date(); todayLocal.setHours(0,0,0,0);
              const isPast = date.getTime() < todayLocal.getTime();
              const isToday = date.getTime() === todayLocal.getTime();
              const isSelected = selectedDate && dateStr === selectedDate;
              return (
                <button
                  key={idx}
                  className={`calendar-day ${reserved ? 'reserved' : 'available'} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${isPast ? 'past' : ''}`}
                  onClick={() => handleDateClick(day)}
                  disabled={reserved || isPast}
                  role="gridcell"
                  aria-disabled={reserved || isPast}
                >
                  <div className="day-number">{day}</div>
                  <div className="day-price">{formatCurrency(getPrice(day))}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <style jsx>{`
        /* Minimal inline styles here are complemented by main stylesheet below */
      `}</style>
    </div>
  );
};

// BedsModal, SuitesModal, ReservationCard, App follow (kept and slightly adjusted) -----------------

const BedsModal = ({ onClose, onConfirm, maxBeds, selectedBeds = [], sheetsData, roomId, checkin, checkout }) => {
  const [selected, setSelected] = useState(new Set(selectedBeds));
  const availableBeds = ["C1-T","C1-B","C2-T","C2-B","C3-T","C3-B","C4-T","C4-B","C5-T","C5-B","C6-T","C6-B","C7-T","C7-B"];
  const toggleBed = (bedId) => {
    if (!availableBeds.includes(bedId)) return;
    const newSelected = new Set(selected);
    if (newSelected.has(bedId)) newSelected.delete(bedId);
    else if (newSelected.size < maxBeds) newSelected.add(bedId);
    setSelected(newSelected);
  };
  const beds = [];
  for (let i=1;i<=7;i++) ['T','B'].forEach(pos=>beds.push({id:`C${i}-${pos}`, label:`C${i}-${pos}`, type: pos==='T' ? 'top' : 'bottom'}));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content beds-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" translate="no">
        <button className="modal-close" onClick={onClose}><X /></button>
        <h3>Mapa de camas — selecione sua(s) cama(s)</h3>
        <p>7 beliches com camas superior e inferior (14 total)</p>
        <div className="beds-container">
          <div className="beds-section">
            <h4>Superior (Top)</h4>
            <div className="beds-grid">{beds.filter(b=>b.type==='top').map(bed=>{const isAvailable=availableBeds.includes(bed.id);const isSelected=selected.has(bed.id);return <button key={bed.id} className={`bed-item ${isSelected ? 'selected' : ''} ${!isAvailable ? 'reserved' : ''}`} onClick={()=>toggleBed(bed.id)} disabled={!isAvailable}><img src="https://i.imgur.com/qwr5wBb.png" alt="Ícone de cama" className="bed-icon"/><svg width="80" height="40" viewBox="0 0 80 40"><rect width="80" height="40" fill={isSelected ? '#27ae60' : !isAvailable ? '#e74c3c' : '#add8e6'} rx="4" /></svg><span>{bed.label}</span></button>)}</div>
          </div>
          <div className="beds-section">
            <h4>Inferior (Bottom)</h4>
            <div className="beds-grid">{beds.filter(b=>b.type==='bottom').map(bed=>{const isAvailable=availableBeds.includes(bed.id);const isSelected=selected.has(bed.id);return <button key={bed.id} className={`bed-item ${isSelected ? 'selected' : ''} ${!isAvailable ? 'reserved' : ''}`} onClick={()=>toggleBed(bed.id)} disabled={!isAvailable}><img src="https://i.imgur.com/qwr5wBb.png" alt="Ícone de cama" className="bed-icon"/><svg width="80" height="40" viewBox="0 0 80 40"><rect width="80" height="40" fill={isSelected ? '#27ae60' : !isAvailable ? '#e74c3c' : '#ffffe0'} rx="4" /></svg><span>{bed.label}</span></button>)}</div>
          </div>
        </div>
        <div className="beds-legend"><span><span className="legend-box available"></span> Disponível</span><span><span className="legend-box selected"></span> Selecionada</span><span><span className="legend-box reserved"></span> Reservada</span></div>
        <div className="modal-actions"><button className="btn-secondary" onClick={()=>setSelected(new Set())}>Limpar</button><button className="btn-primary" onClick={()=>{onConfirm(Array.from(selected)); onClose();}}>Confirmar seleção</button></div>
      </div>
    </div>
  );
};

const SuitesModal = ({ onClose, onConfirm, selectedSuites = [], sheetsData, checkin, checkout }) => {
  const [selected, setSelected] = useState(new Set(selectedSuites));
  const { availableSuites } = useAvailability(sheetsData, 'q777', checkin, checkout);
  const toggleSuite = (suiteId) => {
    if (!availableSuites.includes(suiteId)) return;
    const newSelected = new Set(selected);
    if (newSelected.has(suiteId)) newSelected.delete(suiteId);
    else if (newSelected.size < 3) newSelected.add(suiteId);
    setSelected(newSelected);
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content suites-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" translate="no">
        <button className="modal-close" onClick={onClose}><X /></button>
        <h3>Selecione sua(s) suíte(s)</h3>
        <div className="suites-grid">{['S1','S2','S3'].map(suite=>{const isAvailable=availableSuites.includes(suite);const isSelected=selected.has(suite);return <button key={suite} className={`suite-item ${isSelected ? 'selected' : ''} ${!isAvailable ? 'reserved' : ''}`} onClick={()=>toggleSuite(suite)} disabled={!isAvailable}><img src="https://i.imgur.com/zjJsf7N.jpeg" alt="Ícone de suíte" className="suite-icon"/><div className="suite-label">{suite}</div><div className="suite-price">R$ 300,00/diária</div></button>)}</div>
        <div className="modal-actions"><button className="btn-secondary" onClick={()=>setSelected(new Set())}>Limpar</button><button className="btn-primary" onClick={()=>{onConfirm(Array.from(selected)); onClose();}}>Confirmar seleção</button></div>
      </div>
    </div>
  );
};

const ReservationCard = ({ title, roomId, sheetsData }) => {
  const [checkin, setCheckin] = useState('');
  const [checkout, setCheckout] = useState('');
  const [guests, setGuests] = useState(1);
  const [selectedBeds, setSelectedBeds] = useState([]);
  const [selectedSuites, setSelectedSuites] = useState([]);
  const [earlyCheckin, setEarlyCheckin] = useState(false);
  const [lateCheckout, setLateCheckout] = useState(false);
  const [transferIn, setTransferIn] = useState(false);
  const [transferOut, setTransferOut] = useState(false);
  const [showCalendar, setShowCalendar] = useState(null);
  const [showBedsModal, setShowBedsModal] = useState(false);
  const [showSuitesModal, setShowSuitesModal] = useState(false);
  const [error, setError] = useState('');

  const isSuite = roomId === 'q777';
  const { baseTotal } = useDynamicPricing(sheetsData, roomId, checkin, checkout, guests, selectedBeds, selectedSuites);

  const getExtraPrice = (key) => {
    const extra = sheetsData.extras.find(e => e.key === key);
    return extra ? parseFloat(extra.price) : 0;
  };

  const calculateTotal = () => {
    let total = baseTotal;
    if (earlyCheckin) total += getExtraPrice('early_checkin');
    if (lateCheckout) total += getExtraPrice('late_checkout');
    if (transferIn) total += getExtraPrice('transfer_arrival');
    if (transferOut) total += getExtraPrice('transfer_departure');
    return total;
  };

  const isValid = () => {
    if (!checkin || !checkout) return false;
    if (parseLocalDate(checkout) <= parseLocalDate(checkin)) return false;
    if (isSuite) return selectedSuites.length > 0;
    return selectedBeds.length > 0 && selectedBeds.length <= guests;
  };

  const handleReserve = () => {
    if (!isValid()) { setError('Por favor, complete todos os campos obrigatórios'); return; }
    const nights = Math.ceil((parseLocalDate(checkout) - parseLocalDate(checkin)) / (1000 * 60 * 60 * 24));
    const bedsText = isSuite ? selectedSuites.join(', ') : selectedBeds.join(', ');
    let message = `Olá! Gostaria de solicitar reserva para ${title}.\n\n📅 Check-in: ${formatBRDate(checkin)} (entrada às 14:00)\n📅 Check-out: ${formatBRDate(checkout)} (saída até 12:00)\n🌙 Noites: ${nights}\n👥 Hóspedes: ${guests}\n${isSuite ? '🏠' : '🛏️'} ${isSuite ? 'Suítes' : 'Camas'} escolhidas: ${bedsText}\n\n💰 Resumo de valores:\n- Valor base: ${formatCurrency(baseTotal)}`;
    if (earlyCheckin) message += `\n- Check-in antecipado: ${formatCurrency(getExtraPrice('early_checkin'))}`;
    if (lateCheckout) message += `\n- Check-out estendido: ${formatCurrency(getExtraPrice('late_checkout'))}`;
    if (transferIn) message += `\n- Transfer ida: ${formatCurrency(getExtraPrice('transfer_arrival'))}`;
    if (transferOut) message += `\n- Transfer volta: ${formatCurrency(getExtraPrice('transfer_departure'))}`;
    message += `\n\n💵 Total: ${formatCurrency(calculateTotal())}\n\nObrigado!`;
    const whatsappUrl = `https://wa.me/5521997305179?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <>
      <div className="reservation-card">
        <h3>{title}</h3>
        <p className="card-subtitle">Verificar disponibilidade</p>
        <div className="form-group">
          <label>Check-in</label>
          <input type="text" value={checkin ? formatBRDate(checkin) : ''} readOnly onClick={() => setShowCalendar('checkin')} placeholder="Selecione a data" />
        </div>
        <div className="form-group">
          <label>Check-out</label>
          <input type="text" value={checkout ? formatBRDate(checkout) : ''} readOnly onClick={() => setShowCalendar('checkout')} placeholder="Selecione a data" />
        </div>
        <div className="checkin-times"><span>Check-in às 14:00 • Check-out até 12:00</span></div>
        <div className="form-group"><label>Hóspedes</label><select value={guests} onChange={(e) => setGuests(Number(e.target.value))}>{[...Array(14)].map((_,i)=> <option key={i+1} value={i+1}>{i+1}</option>)}</select></div>
        <button className="btn-select" onClick={() => isSuite ? setShowSuitesModal(true) : setShowBedsModal(true)}>{isSuite ? 'Selecionar suítes' : 'Selecionar camas'}{(isSuite?selectedSuites:selectedBeds).length>0 && ` (${(isSuite?selectedSuites:selectedBeds).length})`}</button>
        <div className="extras-section"><h4>Opções extras</h4><label className="checkbox-label"><input type="checkbox" checked={earlyCheckin} onChange={(e)=>setEarlyCheckin(e.target.checked)} /><span>Check-in antecipado (+{formatCurrency(getExtraPrice('early_checkin'))})</span></label><label className="checkbox-label"><input type="checkbox" checked={lateCheckout} onChange={(e)=>setLateCheckout(e.target.checked)} /><span>Check-out estendido (+{formatCurrency(getExtraPrice('late_checkout'))})</span></label></div>
        <div className="transfer-section"><h4>Transfer</h4><button className={`transfer-btn ${transferIn ? 'active' : ''}`} onClick={() => setTransferIn(!transferIn)}>Transfer ida ao hostel ({formatCurrency(getExtraPrice('transfer_arrival'))})</button><button className={`transfer-btn ${transferOut ? 'active' : ''}`} onClick={() => setTransferOut(!transferOut)}>Transfer volta para aeroporto ({formatCurrency(getExtraPrice('transfer_departure'))})</button></div>
        <div className="price-summary"><h4>Resumo</h4><div className="price-line"><span>Hospedagem</span><span>{formatCurrency(baseTotal)}</span></div>{(earlyCheckin || lateCheckout || transferIn || transferOut) && (<div className="price-line"><span>Extras</span><span>{formatCurrency((earlyCheckin?getExtraPrice('early_checkin'):0)+(lateCheckout?getExtraPrice('late_checkout'):0)+(transferIn?getExtraPrice('transfer_arrival'):0)+(transferOut?getExtraPrice('transfer_departure'):0))}</span></div>)}<div className="price-line total"><span>Total</span><span>{formatCurrency(calculateTotal())}</span></div></div>
        {error && <p className="error-message">{error}</p>}
        <button className="btn-primary btn-reserve" onClick={handleReserve} disabled={!isValid()}>Conferir disponibilidade</button>
        <p className="whatsapp-note">Você será redirecionado para o WhatsApp</p>
      </div>

      {showCalendar && (
        <CalendarModal
          onClose={() => setShowCalendar(null)}
          onSelectDate={(date) => {
            if (showCalendar === 'checkin') setCheckin(date); else setCheckout(date);
            setShowCalendar(null);
          }}
          sheetsData={sheetsData}
          roomId={roomId}
          selectedDate={showCalendar === 'checkin' ? checkin : checkout}
        />
      )}

      {showBedsModal && <BedsModal onClose={() => setShowBedsModal(false)} onConfirm={setSelectedBeds} maxBeds={guests} selectedBeds={selectedBeds} sheetsData={sheetsData} roomId={roomId} checkin={checkin} checkout={checkout} />}
      {showSuitesModal && <SuitesModal onClose={() => setShowSuitesModal(false)} onConfirm={setSelectedSuites} selectedSuites={selectedSuites} sheetsData={sheetsData} checkin={checkin} checkout={checkout} />}
    </>
  );
};

// ==================== APP (force locale & no-translate meta injection) ====================
export default function App() {
  const [showModal, setShowModal] = useState(null);
  const { data: sheetsData, isLoading, error } = useSheetsData();

  // Force HTML lang and block automatic translation by browsers (Chrome mobile etc.)
  useEffect(() => {
    try {
      const html = document.documentElement;
      html.lang = 'pt-BR';
      html.setAttribute('lang', 'pt-BR');
      html.setAttribute('translate', 'no');
      html.classList.add('notranslate');

      document.body.setAttribute('translate', 'no');
      document.body.classList.add('notranslate');

      const head = document.head || document.getElementsByTagName('head')[0];

      const ensureMeta = (attrName, name, content) => {
        let selector;
        if (attrName === 'name') selector = `meta[name="${name}"]`;
        else if (attrName === 'http-equiv') selector = `meta[http-equiv="${name}"]`;
        else selector = `meta[${attrName}="${name}"]`;
        let meta = head.querySelector(selector);
        if (!meta) {
          meta = document.createElement('meta');
          if (attrName === 'name') meta.setAttribute('name', name);
          else if (attrName === 'http-equiv') meta.setAttribute('http-equiv', name);
          else meta.setAttribute(attrName, name);
          meta.setAttribute('content', content);
          head.appendChild(meta);
        } else {
          meta.setAttribute('content', content);
        }
      };

      // Prevent Google Translate and Chrome auto-translate
      ensureMeta('name', 'google', 'notranslate');
      // explicit content language
      ensureMeta('http-equiv', 'Content-Language', 'pt-BR');
      // hint for other tools
      ensureMeta('name', 'locale', 'pt-BR');
    } catch (e) {
      // ignore in non-browser envs
    }
  }, []);

  const roomsData = [
    { name: 'Quarto Feminino FreiSa', location: 'Quarto em Rio de Janeiro, Brasil', beds: 14, bathrooms: '4 banheiros compartilhados', images: ['https://i.imgur.com/5RmzKKS.jpeg','https://i.imgur.com/32uJWkj.jpeg','https://i.imgur.com/Pyt9BLd.jpeg','https://i.imgur.com/QoRrocG.jpeg'], description: 'Quarto exclusivo feminino com ambiente acolhedor e seguro. Perfeito para quem busca conforto e privacidade em Copacabana.', fullDescription: 'Quarto exclusivo feminino com ambiente acolhedor e seguro. Perfeito para quem busca conforto e privacidade em Copacabana. Com 14 camas e 4 banheiros compartilhados, garantimos mais comodidade para nossas hóspedes. O espaço foi pensado para criar um ambiente de sororidade e respeito, onde mulheres viajantes podem se sentir em casa.', highlights: [{ icon: '🚿', title: 'Banheiro compartilhado', text: 'Banheiro de uso coletivo, sempre limpo e organizado.' },{ icon: '🛋️', title: 'Áreas compartilhadas', text: 'Espaços compartilhados para convivência.' },{ icon: '🛏️', title: 'Quarto compartilhado', text: 'Dormitórios coletivos e confortáveis.' }], hasCarousel: true },
    { name: 'Quarto Misto', location: 'Quarto em Rio de Janeiro, Brasil', beds: 14, bathrooms: 'Banheiros compartilhados', images: ['https://i.imgur.com/OddkKoI.jpeg'], description: '🏡 Sobre este espaço: Simplicidade, conforto e localização estratégica...', fullDescription: `Quarto Misto — Detalhes\n\nSimplicidade, conforto...`, highlights: [{ icon: '🚿', title: 'Banheiro compartilhado', text: 'Banheiro de uso coletivo, sempre limpo e organizado, disponível para todos os hóspedes.' },{ icon: '🛋️', title: 'Áreas compartilhadas', text: 'Espaços compartilhados, com área para circulação e convivência.' },{ icon: '🛏️', title: 'Quarto compartilhado', text: 'Dormitórios coletivos, confortáveis e seguros, ideais para quem busca economia e convivência.' }], hasCarousel: false },
    { name: 'Suítes', location: 'Quarto em Rio de Janeiro, Brasil', beds: 3, bathrooms: 'Banheiro privativo', images: ['https://i.imgur.com/W9koWkI.jpeg'], description: 'Simplicidade, conforto e ótima localização...', fullDescription: `Suítes — Detalhes\n\nSimplicidade, conforto...`, highlights: [{ icon: '🛁', title: 'Banheiro privativo', text: 'Banheiro exclusivo em cada suíte, com água quente e itens de higiene.' },{ icon: '❄️', title: 'Ar-condicionado', text: 'Climatização individual para seu conforto.' },{ icon: '📺', title: 'Entretenimento', text: 'TV e Wi-Fi rápido para relaxar ou trabalhar.' }], hasCarousel: false },
    { name: 'Nice Place', location: 'Quarto em Rio de Janeiro, Brasil', beds: 14, bathrooms: '2 banheiros compartilhados', images: ['https://i.imgur.com/OddkKoI.jpeg','https://i.imgur.com/W9koWkI.jpeg','https://i.imgur.com/yEaKK3Q.jpeg','https://i.imgur.com/HUd2mEN.jpeg'], description: 'Espaço confortável e bem localizado em Copacabana...', fullDescription: 'Espaço confortável e bem localizado em Copacabana...', highlights: [{ icon: '🚿', title: 'Banheiro compartilhado', text: 'Banheiro de uso coletivo, sempre limpo e organizado.' },{ icon: '🛋️', title: 'Áreas compartilhadas', text: 'Espaços compartilhados para convivência.' },{ icon: '🛏️', title: 'Quarto compartilhado', text: 'Dormitórios coletivos e confortáveis.' }], hasCarousel: true }
  ];

  if (isLoading) {
    return (
      <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',flexDirection:'column',gap:'20px'}}>
        <Loader size={48} className="spinner" />
        <p>Carregando dados do hostel...</p>
      </div>
    );
  }

  return (
    <div className="app" lang="pt-BR" translate="no">
      <style>{`
        /* ---------- GLOBAL ---------- */
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body { height:100%; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height:1.6; color:#333; -webkit-text-size-adjust:100%; }
        .notranslate { translate: no; }
        /* Ensure high z-index for overlays so nothing can cover the calendar in mobile */
        .calendar-overlay { z-index: 2147483647; position: fixed; top:0; left:0; width:100vw; height:100vh; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.6); }
        .modal-overlay { z-index: 2147483646; }
        /* ---------- CALENDAR ---------- */
        .modal-content.calendar-modal { background:#fff; border-radius:12px; width: min(920px, 96%); max-width:920px; max-height: 90vh; overflow: hidden; display:flex; flex-direction:column; position: relative; }
        .modal-content.calendar-modal.fullscreen { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; max-width:100vw; max-height:100vh; margin: 0; border-radius: 0; padding: env(safe-area-inset-top) 12px env(safe-area-inset-bottom) 12px; box-shadow:none; }
        .calendar-header { display:grid; grid-template-columns: 44px 1fr auto; gap:8px; align-items:center; padding: 8px 4px; background: #fff; position: sticky; top:0; z-index:10; }
        .calendar-header h3 { text-align:center; margin:0; font-size:1.05rem; font-weight:600; }
        .calendar-body { flex:1; overflow:auto; -webkit-overflow-scrolling: touch; }
        .calendar-grid { display:grid; grid-template-columns: repeat(7, 1fr); gap:6px; padding: 8px; }
        .calendar-grid .calendar-day-name { text-align:center; font-weight:600; padding:6px 4px; color:#666; font-size:0.85rem; }
        .calendar-day { display:flex; flex-direction:column; justify-content:center; align-items:center; border:1.5px solid #e0e0e0; border-radius:10px; background:#fff; cursor:pointer; padding:8px; min-height: var(--calendar-row-height, 72px); }
        .calendar-day.empty { background:transparent; border:none; cursor:default; }
        .calendar-day.reserved { background:#e74c3c; color:#fff; cursor:not-allowed; }
        .calendar-day.selected { background:#27ae60; color:#fff; }
        .calendar-day.today { box-shadow: inset 0 0 0 2px #e74c3c; }
        .day-number { font-weight:700; font-size:0.95rem; }
        .day-price { font-size:0.75rem; margin-top:4px; }
        /* When fullscreen: force grid rows to use computed variable and prevent vertical overflow (all weeks will fit) */
        .modal-content.calendar-modal.fullscreen .calendar-body { overflow: hidden; }
        .modal-content.calendar-modal.fullscreen .calendar-grid { grid-auto-rows: var(--calendar-row-height, 72px); }
        /* Fallback: when not enough space, allow scroll on calendar-body (desktop/tablet) */
        @media (min-width: 769px) {
          .modal-content.calendar-modal { max-height: 90vh; }
          .calendar-body { overflow:auto; }
        }
        /* ---------- OTHER STYLES (kept minimal here) ---------- */
        .modal-close { position:absolute; top:12px; right:12px; background:none; border:none; cursor:pointer; }
        .beds-modal, .suites-modal { max-width:900px; overflow:auto; }
        /* keep rest of original CSS elsewhere - this file focuses on functional fixes */
      `}</style>

      {error && (<div className="alert-banner">⚠️ {error} O sistema está usando valores padrão.</div>)}

      <Hero />

      <section className="rooms-section" id="rooms-section">
        <h2>Nossos quartos</h2>
        <p>Escolha o Hostel perfeito para sua experiência inesquecível!</p>
        <div className="rooms-grid">
          {roomsData.map((room, idx) => <RoomCard key={idx} {...room} onShowMore={() => setShowModal(room.name)} />)}
        </div>
      </section>

      <BenefitsSection />
      <TestimonialsSection />

      <section className="reservation-section" id="reservation-section">
        <div className="reservation-cards">
          <ReservationCard title="Nice Place" roomId="jb" sheetsData={sheetsData} />
          <ReservationCard title="Quarto Feminino FreiSa" roomId="ar" sheetsData={sheetsData} />
          <ReservationCard title="Quarto Misto" roomId="q007" sheetsData={sheetsData} />
          <ReservationCard title="Suítes" roomId="q777" sheetsData={sheetsData} />
        </div>
      </section>

      <footer>
        <h3>FreiSa Hostel</h3>
        <p>Copacabana, Rio de Janeiro - Brasil</p>
        <p>WhatsApp: +55 21 99730-5179</p>
        <p style={{marginTop:'20px', opacity:0.7}}>© 2025 FreiSa Hostel. Todos os direitos reservados.</p>
      </footer>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal-content calendar-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModal(null)}><X /></button>
            <h2 style={{marginBottom:'1rem'}}>{showModal}</h2>
            <div style={{lineHeight:1.8,color:'#666',whiteSpace:'pre-line'}}>{roomsData.find(r => r.name === showModal)?.fullDescription || ''}</div>
          </div>
        </div>
      )}
    </div>
  );
}
