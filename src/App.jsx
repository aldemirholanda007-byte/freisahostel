import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Loader } from 'lucide-react';

// ==================== CONFIGURAÇÃO ====================
const SHEET_ID = '1QZewic2mbwaksGyIx5MN7mWTukQdxBOb2yheCydFdCM';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=`;

const SHEET_GIDS = {
  calendar: '0',
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

// Parser de CSV
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
const CACHE_DURATION = 10 * 60 * 1000;

const getCachedData = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (! cached) return null;
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
    pricing:  [],
    rooms: [],
    beds: [],
    suites:  [],
    extras: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSheet = async (gid, retryCount = 0) => {
    if (! SHEET_ID) {
      throw new Error('SHEET_ID não configurado');
    }
    
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
      if (! SHEET_ID) {
        setData({
          calendar: [],
          pricing:  [],
          rooms: [
            { room_id: 'jb', name: 'Nice Place', type: 'dorm', max_guests: '14' },
            { room_id:  'ar', name: 'Quarto Feminino FreiSa', type: 'dorm', max_guests: '14' },
            { room_id: 'q007', name: 'Quarto Misto', type: 'dorm', max_guests: '14' },
            { room_id: 'q777', name: 'Suítes', type: 'suite', max_guests: '3' }
          ],
          beds: [],
          suites: [],
          extras: [
            { key: 'early_checkin', price: '30' },
            { key: 'late_checkout', price: '30' },
            { key: 'transfer_arrival', price: '150' },
            { key: 'transfer_departure', price: '150' },
            { key:  'base_price_nice_place', price: '100' },
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
        setError('Erro ao conectar com Google Sheets.  Verifique a configuração.');
        setData({
          calendar: [],
          pricing:  [],
          rooms: [
            { room_id: 'jb', name: 'Nice Place', type: 'dorm', max_guests: '14' },
            { room_id: 'ar', name: 'Quarto Feminino FreiSa', type: 'dorm', max_guests: '14' },
            { room_id:  'q007', name: 'Quarto Misto', type: 'dorm', max_guests: '14' },
            { room_id: 'q777', name: 'Suítes', type: 'suite', max_guests: '3' }
          ],
          beds: [],
          suites: [],
          extras: [
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
    if (!checkin || !checkout || !sheetsData. calendar.length) {
      return { availableBeds: [], availableSuites: [], isAvailable: true };
    }

    const start = parseLocalDate(checkin);
    const end = parseLocalDate(checkout);
    const dates = [];

    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      dates.push(formatLocalDate(d));
    }

    const blockedDates = sheetsData.calendar.filter(row => 
      row.room_id === roomId && 
      dates.includes(row.date) && 
      (row.status === 'reserved' || row.status === 'blocked')
    );

    if (blockedDates.length > 0) {
      return { availableBeds: [], availableSuites: [], isAvailable: false };
    }

    const availableBeds = [];
    if (roomId !== 'q777') {
      for (let i = 1; i <= 7; i++) {
        ['T', 'B']. forEach(pos => {
          const bedId = `C${i}-${pos}`;
          const isBooked = dates.some(date => 
            sheetsData.beds.some(bed => 
              bed.room_id === roomId && 
              bed.date === date && 
              bed.bed_id === bedId && 
              bed.status === 'booked'
            )
          );
          if (!isBooked) availableBeds.push(bedId);
        });
      }
    }

    const availableSuites = [];
    if (roomId === 'q777') {
      ['S1', 'S2', 'S3']. forEach(suiteId => {
        const isBooked = dates.some(date =>
          sheetsData.suites.some(suite =>
            suite.date === date &&
            suite.suite_id === suiteId &&
            suite.status === 'booked'
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
    ar:  'base_price_quarto_feminino',
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

      const priceRow = sheetsData.pricing.find(p => 
        p.room_id === roomId && p.date === dateStr
      );

      const pricePerUnit = priceRow ? parseFloat(priceRow.price) : getBasePrice(sheetsData, roomId);

      let nightTotal;
      if (roomId === 'q777') {
        nightTotal = pricePerUnit * selectedSuites. length;
      } else {
        nightTotal = pricePerUnit * guests;
      }

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
    if (! isPaused && images.length > 1) {
      const timer = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
      }, interval);
      return () => clearInterval(timer);
    }
  }, [currentIndex, images.length, interval, isPaused]);

  const next = () => setCurrentIndex((prev) => (prev + 1) % images.length);
  const prev = () => setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  const goTo = (index) => setCurrentIndex(index);

  return { currentIndex, next, prev, goTo, setIsPaused };
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
    if (el) el.scrollIntoView({ behavior: 'smooth', block:  'start' });
  };

  return (
    <div 
      className="hero"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      translate="no"
    >
      {images.map((img, idx) => (
        <div
          key={idx}
          className="hero-slide"
          style={{
            backgroundImage: `url(${img})`,
            opacity: idx === currentIndex ? 1 :  0,
            transition: 'opacity 1. 5s ease-in-out'
          }}
        />
      ))}
      <div className="hero-overlay" />
      <div className="hero-content" translate="no">
        <h1>FreiSa Hostel</h1>
        <p>Hospitalidade Que Conecta Pessoas. </p>
        <div className="hero-buttons">
          <button className="btn-primary" onClick={scrollToReservation}>Reserve Aqui</button>
          <button className="btn-secondary" onClick={scrollToRooms}>Conheça Nossas Instalações</button>
        </div>
      </div>
      <button className="carousel-btn carousel-prev" onClick={prev} aria-label="Previous">
        <ChevronLeft size={32} />
      </button>
      <button className="carousel-btn carousel-next" onClick={next} aria-label="Next">
        <ChevronRight size={32} />
      </button>
      <div className="carousel-indicators">
        {images.map((_, idx) => (
          <button
            key={idx}
            className={`indicator ${idx === currentIndex ? 'active' : ''}`}
            onClick={() => goTo(idx)}
            aria-label={`Go to slide ${idx + 1}`}
          />
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
      <div className="room-card" translate="no">
        <div className="room-header">{name}</div>
        <div className="room-carousel">
          <img 
            src={hasCarousel ? images[currentIndex] : images[0]} 
            alt={name}
            onClick={() => setLightboxOpen(true)}
            style={{ cursor: 'pointer' }}
          />
          {hasCarousel && images.length > 1 && (
            <>
              <button className="carousel-btn carousel-prev" onClick={prev}>
                <ChevronLeft size={24} />
              </button>
              <button className="carousel-btn carousel-next" onClick={next}>
                <ChevronRight size={24} />
              </button>
              <div className="carousel-indicators">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    className={`indicator ${idx === currentIndex ? 'active' : ''}`}
                    onClick={() => goTo(idx)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <div className="room-info">
          <p className="room-location">{location}</p>
          <p className="room-specs">{beds} camas · {bathrooms}</p>
          <div className="divider" />
          <div className="room-highlights">
            {highlights.map((highlight, idx) => (
              <div key={idx} className="highlight">
                <span className="highlight-icon">{highlight.icon}</span>
                <div>
                  <strong>{highlight.title}</strong>
                  <p style={{margin: 0, fontSize: '0.9rem', color: '#666'}}>{highlight.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="divider" />
          <p className="room-description">{description. substring(0, 150)}...</p>
          <button className="btn-text" onClick={onShowMore}>Mostrar mais</button>
        </div>
      </div>
      {lightboxOpen && (
        <Lightbox images={images} initialIndex={hasCarousel ? currentIndex : 0} onClose={() => setLightboxOpen(false)} />
      )}
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
    <div className="lightbox" onClick={onClose} translate="no">
      <button className="lightbox-close" onClick={onClose}>
        <X size={32} />
      </button>
      <img 
        src={images[currentIndex]} 
        alt="" 
        onClick={(e) => e.stopPropagation()}
      />
      <button 
        className="carousel-btn carousel-prev" 
        onClick={(e) => { e.stopPropagation(); setCurrentIndex((prev) => (prev - 1 + images.length) % images.length); }}
      >
        <ChevronLeft size={32} />
      </button>
      <button 
        className="carousel-btn carousel-next" 
        onClick={(e) => { e.stopPropagation(); setCurrentIndex((prev) => (prev + 1) % images.length); }}
      >
        <ChevronRight size={32} />
      </button>
    </div>
  );
};

const BenefitsSection = () => {
  const benefits = [
    { icon: '📍', title: 'Localização Estratégica', text: 'Em Copacabana, perto de tudo que você precisa' },
    { icon: '💰', title: 'Excelente Custo-Benefício', text:  'Preços justos para uma experiência incrível' },
    { icon: '🔒', title: 'Conforto e Segurança', text: 'Sua estadia tranquila é nossa prioridade' },
    { icon: '🤝', title: 'Ambiente Social', text: 'Conheça viajantes do mundo todo' },
    { icon: '🍳', title: 'Estrutura Prática', text: 'Cozinha compartilhada e áreas comuns' },
    { icon:  '🌳', title: 'Experiência Carioca', text: 'Viva o Rio de Janeiro autenticamente' }
  ];

  return (
    <section className="benefits-section" translate="no">
      <h2>Por Que Escolher o FreiSa Hostel?</h2>
      <div className="benefits-grid">
        {benefits.map((benefit, idx) => (
          <div key={idx} className="benefit-card">
            <div className="benefit-icon">{benefit.icon}</div>
            <h3>{benefit.title}</h3>
            <p>{benefit.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

const TestimonialsSection = () => {
  const testimonials = [
    { text: 'Fiquei 4 noites em Copacabana.  Localização excelente — mercados, padarias e bares na mesma rua; a apenas 2 minutos da praia... ', name: 'Hóspede', location: 'Brasil' },
    { text: 'Minha hospedagem foi super tranquila. A um quarteirão da praia e perto do SESC Copacabana... ', name: 'Hóspede', location: 'Internacional' },
    { text: 'Localização excelente; o proprietário estava disponível sempre que precisei... ', name: 'Hóspede', location: 'São Paulo' }
  ];

  return (
    <section className="testimonials-section" translate="no">
      <h2>O Que Dizem Nossos Hóspedes</h2>
      <div className="testimonials-grid">
        {testimonials. map((testimonial, idx) => (
          <div key={idx} className="testimonial-card">
            <p className="testimonial-text">"{testimonial.text}"</p>
            <div className="testimonial-author">
              <div className="author-avatar">{testimonial.name[0]}</div>
              <div>
                <div className="author-name">{testimonial.name}</div>
                <div className="author-location">{testimonial.location}</div>
              </div>
            </div>
            <div className="testimonial-stars">★★★★★</div>
          </div>
        ))}
      </div>
      <p className="testimonials-note">Todas as referências foram editadas para clareza. </p>
    </section>
  );
};

const CalendarModal = ({ onClose, onSelectDate, sheetsData, roomId, selectedDate }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const modalRef = useRef(null);
  const headerRef = useRef(null);
  const dayNamesRef = useRef(null);

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ?  window.innerWidth <= 768 : false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  useEffect(() => {
    if (! isMobile) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document. documentElement.style.overscrollBehavior = 'none';
    return () => {
      document.body.style. overflow = prevOverflow || '';
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
    if (! day) return 0;
    const year = currentDate.getFullYear();
    const month = currentDate. getMonth();
    const dateStr = formatDateToYYYYMMDD(year, month, day);
    const priceRow = sheetsData.pricing.find(p => p.room_id === roomId && p.date === dateStr);
    return priceRow ? parseFloat(priceRow.price) : getBasePrice(sheetsData, roomId);
  };

  const isReserved = (day) => {
    if (!day) return false;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const dateStr = formatDateToYYYYMMDD(year, month, day);
    return sheetsData.calendar.some(row => row.room_id === roomId && row. date === dateStr && (row. status === 'reserved' || row.status === 'blocked'));
  };

  const handleDateClick = (day) => {
    if (! day) return;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const localDate = createLocalDate(year, month, day);
    localDate.setHours(0,0,0,0);
    const todayLocal = new Date();
    todayLocal.setHours(0,0,0,0);
    const dateStr = formatDateToYYYYMMDD(year, month, day);
    if (! isReserved(day) && localDate.getTime() >= todayLocal.getTime()) onSelectDate(dateStr);
  };

  useEffect(() => {
    const computeRowHeight = () => {
      if (!modalRef.current || !headerRef.current || !dayNamesRef.current) return;
      const vh = window.innerHeight;
      const headerRect = headerRef.current.getBoundingClientRect();
      const dayNamesRect = dayNamesRef.current.getBoundingClientRect();
      const available = Math.max(200, vh - headerRect.height - dayNamesRect.height - 24);
      const weeks = Math.ceil(days.length / 7);
      const rowHeight = Math.floor(available / weeks);
      modalRef.current.style.setProperty('--calendar-row-height', `${rowHeight}px`);
      modalRef.current.style.setProperty('--calendar-header-height', `${Math.ceil(headerRect.height)}px`);
    };
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
    <div className="modal-overlay calendar-overlay" onClick={onClose} aria-hidden={false} translate="no">
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
              {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']. map(d => (
                <div key={d} className="calendar-day-name" role="columnheader">{d}</div>
              ))}
            </div>

            {days.map((day, idx) => {
              if (! day) return <div key={idx} className="calendar-day empty" />;
              const year = currentDate.getFullYear();
              const month = currentDate. getMonth();
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
                  className={`calendar-day ${reserved ? 'reserved' : 'available'} ${isToday ? 'today' :  ''} ${isSelected ? 'selected' : ''} ${isPast ? 'past' : ''}`}
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
    </div>
  );
};

const BedsModal = ({ onClose, onConfirm, maxBeds, selectedBeds = [], sheetsData, roomId, checkin, checkout }) => {
  const [selected, setSelected] = useState(new Set(selectedBeds));
  
  const availableBeds = [
  "C1-T","C1-B","C2-T","C2-B","C3-T","C3-B",
  "C4-T","C4-B","C5-T","C5-B","C6-T","C6-B","C7-T","C7-B"
];

  const toggleBed = (bedId) => {
    if (! availableBeds.includes(bedId)) return;
    
    const newSelected = new Set(selected);
    if (newSelected.has(bedId)) {
      newSelected.delete(bedId);
    } else if (newSelected.size < maxBeds) {
      newSelected.add(bedId);
    }
    setSelected(newSelected);
  };

  const beds = [];
  for (let i = 1; i <= 7; i++) {
    ['T', 'B'].forEach(pos => {
      beds.push({ id: `C${i}-${pos}`, label: `C${i}-${pos}`, type: pos === 'T' ? 'top' : 'bottom' });
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose} translate="no">
      <div className="modal-content beds-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X /></button>
        <h3>Mapa de camas — selecione sua(s) cama(s)</h3>
        <p>7 beliches com camas superior e inferior (14 total)</p>
        <div className="beds-container">
          <div className="beds-section">
            <h4>Superior (Top)</h4>
            <div className="beds-grid">
              {beds.filter(b => b.type === 'top').map(bed => {
                const isAvailable = availableBeds.includes(bed.id);
                const isSelected = selected.has(bed.id);
                return (
                  <button
                    key={bed.id}
                    className={`bed-item ${isSelected ? 'selected' : ''} ${! isAvailable ? 'reserved' : ''}`}
                    onClick={() => toggleBed(bed.id)}
                    disabled={! isAvailable}
                  >
                    <img 
                      src="https://i.imgur.com/qwr5wBb.png" 
                      alt="Ícone de cama" 
                      className="bed-icon"
                    />
                    <svg width="80" height="40" viewBox="0 0 80 40">
                      <rect width="80" height="40" fill={isSelected ? '#27ae60' : ! isAvailable ? '#e74c3c' : '#add8e6'} rx="4" />
                    </svg>
                    <span>{bed.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="beds-section">
            <h4>Inferior (Bottom)</h4>
            <div className="beds-grid">
              {beds.filter(b => b.type === 'bottom').map(bed => {
                const isAvailable = availableBeds.includes(bed.id);
                const isSelected = selected.has(bed.id);
                return (
                  <button
                    key={bed.id}
                    className={`bed-item ${isSelected ? 'selected' : ''} ${!isAvailable ? 'reserved' : ''}`}
                    onClick={() => toggleBed(bed.id)}
                    disabled={!isAvailable}
                  >
                    <img 
                      src="https://i.imgur.com/qwr5wBb.png" 
                      alt="Ícone de cama" 
                      className="bed-icon"
                    />
                    <svg width="80" height="40" viewBox="0 0 80 40">
                      <rect width="80" height="40" fill={isSelected ? '#27ae60' : !isAvailable ? '#e74c3c' : '#ffffe0'} rx="4" />
                    </svg>
                    <span>{bed.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="beds-legend">
          <span><span className="legend-box available"></span> Disponível</span>
          <span><span className="legend-box selected"></span> Selecionada</span>
          <span><span className="legend-box reserved"></span> Reservada</span>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setSelected(new Set())}>Limpar</button>
          <button className="btn-primary" onClick={() => { onConfirm(Array.from(selected)); onClose(); }}>
            Confirmar seleção
          </button>
        </div>
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
    if (newSelected. has(suiteId)) {
      newSelected.delete(suiteId);
    } else if (newSelected.size < 3) {
      newSelected.add(suiteId);
    }
    setSelected(newSelected);
  };

  return (
    <div className="modal-overlay" onClick={onClose} translate="no">
      <div className="modal-content suites-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}><X /></button>
        <h3>Selecione sua(s) suíte(s)</h3>
        <div className="suites-grid">
          {['S1', 'S2', 'S3']. map(suite => {
            const isAvailable = availableSuites.includes(suite);
            const isSelected = selected.has(suite);
            return (
              <button
                key={suite}
                className={`suite-item ${isSelected ? 'selected' : ''} ${!isAvailable ? 'reserved' : ''}`}
                onClick={() => toggleSuite(suite)}
                disabled={!isAvailable}
              >
                <img 
                  src="https://i.imgur.com/zjJsf7N.jpeg" 
                  alt="Ícone de suíte" 
                  className="suite-icon"
                />
                <div className="suite-label">{suite}</div>
                <div className="suite-price">R$ 300,00/diária</div>
              </button>
            );
          })}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setSelected(new Set())}>Limpar</button>
          <button className="btn-primary" onClick={() => { onConfirm(Array.from(selected)); onClose(); }}>
            Confirmar seleção
          </button>
        </div>
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
  
  const { baseTotal } = useDynamicPricing(
    sheetsData, 
    roomId, 
    checkin, 
    checkout, 
    guests, 
    selectedBeds, 
    selectedSuites
  );

  const getExtraPrice = (key) => {
    const extra = sheetsData.extras. find(e => e.key === key);
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
    if (!isValid()) {
      setError('Por favor, complete todos os campos obrigatórios');
      return;
    }

    const nights = Math.ceil(
      (parseLocalDate(checkout) - parseLocalDate(checkin)) / (1000 * 60 * 60 * 24)
    );

    const bedsText = isSuite ? selectedSuites.join(', ') : selectedBeds.join(', ');
    
    let message = `Olá!  Gostaria de solicitar reserva para ${title}. 

📅 Check-in: ${formatBRDate(checkin)} (entrada às 14:00)
📅 Check-out: ${formatBRDate(checkout)} (saída até 12:00)
🌙 Noites: ${nights}
👥 Hóspedes: ${guests}
${isSuite ? '🏠' : '🛏️'} ${isSuite ? 'Suítes' : 'Camas'} escolhidas:  ${bedsText}

💰 Resumo de valores:
- Valor base: ${formatCurrency(baseTotal)}`;

    if (earlyCheckin) message += `\n- Check-in antecipado: ${formatCurrency(getExtraPrice('early_checkin'))}`;
    if (lateCheckout) message += `\n- Check-out estendido: ${formatCurrency(getExtraPrice('late_checkout'))}`;
    if (transferIn) message += `\n- Transfer ida: ${formatCurrency(getExtraPrice('transfer_arrival'))}`;
    if (transferOut) message += `\n- Transfer volta: ${formatCurrency(getExtraPrice('transfer_departure'))}`;

    message += `\n\n💵 Total: ${formatCurrency(calculateTotal())}

Obrigado! `;

    const whatsappUrl = `https://wa.me/5521997305179?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <>
      <div className="reservation-card" translate="no">
        <h3>{title}</h3>
        <p className="card-subtitle">Verificar disponibilidade</p>
        
        <div className="form-group">
          <label>Check-in</label>
          <input
            type="text"
            value={checkin ?  formatBRDate(checkin) : ''}
            readOnly
            onClick={() => setShowCalendar('checkin')}
            placeholder="Selecione a data"
          />
        </div>

        <div className="form-group">
          <label>Check-out</label>
          <input
            type="text"
            value={checkout ? formatBRDate(checkout) : ''}
            readOnly
            onClick={() => setShowCalendar('checkout')}
            placeholder="Selecione a data"
          />
        </div>

        <div className="checkin-times">
          <span>Check-in às 14:00 • Check-out até 12:00</span>
        </div>

        <div className="form-group">
          <label>Hóspedes</label>
          <select value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
            {[... Array(14)].map((_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </div>

        <button 
          className="btn-select"
          onClick={() => isSuite ? setShowSuitesModal(true) : setShowBedsModal(true)}
        >
          {isSuite ? 'Selecionar suítes' : 'Selecionar camas'}
          {(isSuite ?  selectedSuites : selectedBeds).length > 0 && ` (${(isSuite ? selectedSuites :  selectedBeds).length})`}
        </button>

        <div className="extras-section">
          <h4>Opções extras</h4>
          <label className="checkbox-label">
            <input type="checkbox" checked={earlyCheckin} onChange={(e) => setEarlyCheckin(e.target.checked)} />
            <span>Check-in antecipado (+{formatCurrency(getExtraPrice('early_checkin'))})</span>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={lateCheckout} onChange={(e) => setLateCheckout(e.target.checked)} />
            <span>Check-out estendido (+{formatCurrency(getExtraPrice('late_checkout'))})</span>
          </label>
        </div>

        <div className="transfer-section">
          <h4>Transfer</h4>
          <button 
            className={`transfer-btn ${transferIn ? 'active' : ''}`}
            onClick={() => setTransferIn(!transferIn)}
          >
            Transfer ida ao hostel ({formatCurrency(getExtraPrice('transfer_arrival'))})
          </button>
          <button 
            className={`transfer-btn ${transferOut ? 'active' : ''}`}
            onClick={() => setTransferOut(!transferOut)}
          >
            Transfer volta para aeroporto ({formatCurrency(getExtraPrice('transfer_departure'))})
          </button>
        </div>

        <div className="price-summary">
          <h4>Resumo</h4>
          <div className="price-line">
            <span>Hospedagem</span>
            <span>{formatCurrency(baseTotal)}</span>
          </div>
          {(earlyCheckin || lateCheckout || transferIn || transferOut) && (
            <div className="price-line">
              <span>Extras</span>
              <span>{formatCurrency(
                (earlyCheckin ?  getExtraPrice('early_checkin') : 0) + 
                (lateCheckout ? getExtraPrice('late_checkout') : 0) + 
                (transferIn ? getExtraPrice('transfer_arrival') : 0) + 
                (transferOut ? getExtraPrice('transfer_departure') : 0)
              )}</span>
            </div>
          )}
          <div className="price-line total">
            <span>Total</span>
            <span>{formatCurrency(calculateTotal())}</span>
          </div>
        </div>

        {error && <p className="error-message">{error}</p>}

        <button 
          className="btn-primary btn-reserve"
          onClick={handleReserve}
          disabled={!isValid()}
        >
          Conferir disponibilidade
        </button>

        <p className="whatsapp-note">Você será redirecionado para o WhatsApp</p>
      </div>

      {showCalendar && (
        <CalendarModal
          onClose={() => setShowCalendar(null)}
          onSelectDate={(date) => {
            if (showCalendar === 'checkin') setCheckin(date);
            else setCheckout(date);
            setShowCalendar(null);
          }}
          sheetsData={sheetsData}
          roomId={roomId}
          selectedDate={showCalendar === 'checkin' ? checkin : checkout}
        />
      )}

      {showBedsModal && (
        <BedsModal
          onClose={() => setShowBedsModal(false)}
          onConfirm={setSelectedBeds}
          maxBeds={guests}
          selectedBeds={selectedBeds}
          sheetsData={sheetsData}
          roomId={roomId}
          checkin={checkin}
          checkout={checkout}
        />
      )}

      {showSuitesModal && (
        <SuitesModal
          onClose={() => setShowSuitesModal(false)}
          onConfirm={setSelectedSuites}
          selectedSuites={selectedSuites}
          sheetsData={sheetsData}
          checkin={checkin}
          checkout={checkout}
        />
      )}
    </>
  );
};

// Main App
export default function App() {
  const [showModal, setShowModal] = useState(null);
  const { data: sheetsData, isLoading, error } = useSheetsData();

  // ✅ SETUP DE META TAGS - CRÍTICO PARA MOBILE E GOOGLE TRANSLATE
  useEffect(() => {
    try {
      // 1. Configurar HTML root
      const html = document. documentElement;
      html.lang = 'pt-BR';
      html.setAttribute('lang', 'pt-BR');
      html.setAttribute('translate', 'no');
      html.classList.add('notranslate');

      // 2. Configurar BODY
      document.body.setAttribute('translate', 'no');
      document.body.classList.add('notranslate');

      // 3. Acessar HEAD
      const head = document.head || document.getElementsByTagName('head')[0];

      // Função auxiliar para meta tags
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

      // ✅ VIEWPORT - CRÍTICO PARA MOBILE (máximo suporte)
      ensureMeta('name', 'viewport', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover');
      
      // ✅ Prevenir Google Translate
      ensureMeta('name', 'google', 'notranslate');
      ensureMeta('http-equiv', 'Content-Language', 'pt-BR');
      ensureMeta('name', 'locale', 'pt-BR');
      
      // ✅ Otimizações mobile
      ensureMeta('name', 'apple-mobile-web-app-capable', 'yes');
      ensureMeta('name', 'apple-mobile-web-app-status-bar-style', 'black-translucent');
      ensureMeta('name', 'format-detection', 'telephone=no');
      ensureMeta('name', 'mobile-web-app-capable', 'yes');
      ensureMeta('name', 'theme-color', '#ffffff');

      // ✅ Prevenir gestos de zoom
      const preventGesture = (e) => e.preventDefault();
      document.addEventListener('gesturestart', preventGesture, false);
      document.addEventListener('touchmove', (e) => {
        if (e.scale && e.scale !== 1) {
          e.preventDefault();
        }
      }, { passive: false });

      return () => {
        document.removeEventListener('gesturestart', preventGesture);
      };

    } catch (e) {
      console.warn('Meta setup error:', e);
    }
  }, []);

  const roomsData = [
    {
      name: 'Quarto Feminino FreiSa',
      location: 'Quarto em Rio de Janeiro, Brasil',
      beds: 14,
      bathrooms: '4 banheiros compartilhados',
      images: [
        'https://i.imgur.com/5RmzKKS.jpeg',
        'https://i.imgur.com/32uJWkj.jpeg',
        'https://i.imgur.com/Pyt9BLd.jpeg',
        'https://i.imgur.com/QoRrocG.jpeg'
      ],
      description: 'Quarto exclusivo feminino com ambiente acolhedor e seguro. Perfeito para quem busca conforto e privacidade em Copacabana.',
      fullDescription: 'Quarto exclusivo feminino com ambiente acolhedor e seguro. Perfeito para quem busca conforto e privacidade em Copacabana.  Com 14 camas e 4 banheiros compartilhados, garantimos mais comodidade para nossas hóspedes.  O espaço foi pensado para criar um ambiente de sororidade e respeito, onde mulheres viajantes podem se sentir em casa.',
      highlights: [
        { icon: '🚿', title: 'Banheiro compartilhado', text: 'Banheiro de uso coletivo, sempre limpo e organizado.' },
        { icon: '🛋️', title: 'Áreas compartilhadas', text: 'Espaços compartilhados para convivência.' },
        { icon: '🛏️', title: 'Quarto compartilhado', text: 'Dormitórios coletivos e confortáveis.' }
      ],
      hasCarousel: true
    },
    {
      name: 'Quarto Misto',
      location: 'Quarto em Rio de Janeiro, Brasil',
      beds: 14,
      bathrooms: 'Banheiros compartilhados',
      images: [
        'https://i.imgur.com/OddkKoI.jpeg'
      ],
      description: '🏡 Sobre este espaço:  Simplicidade, conforto e localização estratégica definem esta hospedagem pensada para quem quer relaxar e aproveitar a cidade com tranquilidade.  Um espaço acolhedor, funcional e bem equipado para você se sentir em casa desde o primeiro momento.',
      fullDescription: `Quarto Misto — Detalhes

Simplicidade, conforto e localização estratégica definem esta hospedagem pensada para quem quer relaxar e aproveitar a cidade com tranquilidade. Um espaço acolhedor, funcional e bem equipado para você se sentir em casa desde o primeiro momento. 

🛁 Banheiro completo
Banheiro confortável com água quente, secador de cabelo e todos os itens essenciais de higiene, incluindo xampu, sabonete, gel de banho e produtos de limpeza.

🛏️ Quarto e lavanderia
Ambiente preparado para o descanso, com roupa de cama, local para guardar suas roupas e ferro de passar, garantindo praticidade durante toda a estadia. 

📺 Entretenimento e climatização
Relaxe com TV e aproveite o ar-condicionado, ideal para os dias mais quentes. 

🔒 Segurança
Espaço equipado com extintor de incêndio, oferecendo mais tranquilidade durante sua hospedagem. 

🌐 Internet e trabalho
Wi-Fi rápido, perfeito tanto para lazer quanto para quem precisa trabalhar remotamente. 

🍳 Cozinha compartilhada e área de refeições
Cozinha completa para preparar suas próprias refeições com total conforto: 
• Refrigerador, micro-ondas, fogão e forno
• Cafeteira, chaleira elétrica, torradeira e liquidificador
• Louças, talheres, taças de vinho e utensílios básicos
• Panelas, vasilhas, óleo, sal e pimenta

🧳 Serviços adicionais
Oferecemos guarda de bagagem, ideal para quem chega cedo ou precisa aproveitar a cidade até mais tarde no dia do check-out.

Um espaço simples, funcional e acolhedor, perfeito para quem busca conforto, praticidade e uma excelente localização. `,
      highlights: [
        { icon: '🚿', title: 'Banheiro compartilhado', text: 'Banheiro de uso coletivo, sempre limpo e organizado, disponível para todos os hóspedes.' },
        { icon: '🛋️', title: 'Áreas compartilhadas', text: 'Espaços compartilhados, com área para circulação e convivência.' },
        { icon: '🛏️', title: 'Quarto compartilhado', text: 'Dormitórios coletivos, confortáveis e seguros, ideais para quem busca economia e convivência.' }
      ],
      hasCarousel: false
    },
    {
      name: 'Suítes',
      location: 'Quarto em Rio de Janeiro, Brasil',
      beds: 3,
      bathrooms: 'Banheiro privativo',
      images: [
        'https://i.imgur.com/W9koWkI.jpeg'
      ],
      description: 'Simplicidade, conforto e ótima localização definem esta hospedagem ideal para relaxar e curtir a cidade com tranquilidade.  Um espaço acolhedor, funcional e bem equipado para você se sentir em casa desde o início.',
      fullDescription: `Suítes — Detalhes

Simplicidade, conforto e ótima localização definem esta hospedagem ideal para relaxar e curtir a cidade com tranquilidade. Um espaço acolhedor, funcional e bem equipado para você se sentir em casa desde o início. 

🛁 Banheiro completo
Água quente, secador de cabelo e itens essenciais de higiene, como xampu, sabonete e gel de banho. 

🛏️ Quarto e lavanderia
Ambiente confortável para descanso, com roupa de cama, espaço para roupas e ferro de passar. 

📺 Entretenimento e climatização
TV e ar-condicionado para mais conforto nos dias quentes. 

🔒 Segurança
Espaço equipado com extintor de incêndio. 

🌐 Internet e trabalho
Wi-Fi rápido, ideal para lazer ou trabalho remoto. 

🍳 Cozinha compartilhada e área de refeições
Cozinha completa para preparar suas próprias refeições com total conforto:
• Refrigerador, micro-ondas, fogão e forno
• Cafeteira, chaleira elétrica, torradeira e liquidificador
• Louças, talheres, taças de vinho e utensílios básicos
• Panelas, vasilhas, óleo, sal e pimenta

🧳 Serviços adicionais
Oferecemos guarda de bagagem, ideal para quem chega cedo ou precisa aproveitar a cidade até mais tarde no dia do check-out.

Um espaço simples, funcional e acolhedor, perfeito para quem busca conforto, praticidade e uma excelente localização.`,
      highlights: [
        { icon: '🚿', title: 'Banheiro compartilhado', text: 'Banheiro de uso coletivo, sempre limpo e organizado, disponível para todos os hóspedes.' },
        { icon: '🛋️', title: 'Áreas compartilhadas', text: 'Espaços compartilhados, com área para circulação e convivência.' },
        { icon: '🛏️', title: 'Quarto compartilhado', text: 'Dormitórios coletivos, confortáveis e seguros, ideais para quem busca economia e convivência.' }
      ],
      hasCarousel: false
    },
    {
      name: 'Suítes',
      location: 'Quarto em Rio de Janeiro, Brasil',
      beds: 3,
      bathrooms: 'Banheiro privativo',
      images: [
        'https://i.imgur.com/W9koWkI.jpeg'
      ],
      description: 'Simplicidade, conforto e ótima localização definem esta hospedagem ideal para relaxar e curtir a cidade com tranquilidade. Um espaço acolhedor, funcional e bem equipado para você se sentir em casa desde o início.',
      fullDescription: `Suítes — Detalhes

Simplicidade, conforto e ótima localização definem esta hospedagem ideal para relaxar e curtir a cidade com tranquilidade. Um espaço acolhedor, funcional e bem equipado para você se sentir em casa desde o início.

🛁 Banheiro completo
Água quente, secador de cabelo e itens essenciais de higiene, como xampu, sabonete e gel de banho.

🛏️ Quarto e lavanderia
Ambiente confortável para descanso, com roupa de cama, espaço para roupas e ferro de passar.

📺 Entretenimento e climatização
TV e ar-condicionado para mais conforto nos dias quentes.

🔒 Segurança
Espaço equipado com extintor de incêndio.

🌐 Internet e trabalho
Wi-Fi rápido, ideal para lazer ou trabalho remoto.

🍳 Cozinha compartilhada e área de refeições
Cozinha completa com eletrodomésticos, utensílios, louças e itens básicos para preparo de refeições.

🧳 Serviços adicionais
Guarda de bagagem disponível para maior comodidade no check-in e check-out.

Um espaço prático e acolhedor, perfeito para quem busca conforto, funcionalidade e boa localização.`,
      highlights: [
        { icon: '🛁', title: 'Banheiro privativo', text: 'Banheiro exclusivo em cada suíte, com água quente e itens de higiene.' },
        { icon: '❄️', title: 'Ar-condicionado', text: 'Climatização individual para seu conforto.' },
        { icon: '📺', title: 'Entretenimento', text: 'TV e Wi-Fi rápido para relaxar ou trabalhar.' }
      ],
      hasCarousel: false
    },
    {
      name: 'Nice Place',
      location: 'Quarto em Rio de Janeiro, Brasil',
      beds: 14,
      bathrooms: '2 banheiros compartilhados',
      images: [
        'https://i.imgur.com/OddkKoI.jpeg',
        'https://i.imgur.com/W9koWkI.jpeg',
        'https://i.imgur.com/yEaKK3Q.jpeg',
        'https://i.imgur.com/HUd2mEN.jpeg'
      ],
      description: 'Espaço confortável e bem localizado em Copacabana. Ideal para quem quer aproveitar o melhor do Rio de Janeiro.',
      fullDescription: 'Espaço confortável e bem localizado em Copacabana. Ideal para quem quer aproveitar o melhor do Rio de Janeiro. Com 14 camas distribuídas em beliches e 2 banheiros compartilhados, oferecemos um ambiente social e acolhedor. A localização estratégica permite acesso rápido à praia, mercados, restaurantes e transporte público.',
      highlights: [
        { icon: '🚿', title: 'Banheiro compartilhado', text: 'Banheiro de uso coletivo, sempre limpo e organizado.' },
        { icon: '🛋️', title: 'Áreas compartilhadas', text: 'Espaços compartilhados para convivência.' },
        { icon: '🛏️', title: 'Quarto compartilhado', text: 'Dormitórios coletivos e confortáveis.' }
      ],
      hasCarousel: true
    }
  ];

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '20px' }}>
        <Loader size={48} className="spinner" />
        <p>Carregando dados do hostel...</p>
      </div>
    );
  }

  return (
    <div className="app" lang="pt-BR" translate="no">
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        html {
          height: 100%;
          -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
          -webkit-touch-callout: none;
        }

        html, body {
          height: 100%;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          -webkit-text-size-adjust: 100%;
          position: relative;
          min-height: 100vh;
        }

        .app {
          overflow-x: hidden;
          width: 100%;
          position: relative;
        }

        /* Prevenir zoom indesejado em inputs no iOS */
        input, select, textarea, button {
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
        }

        /* Suavizar scrolling */
        * {
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }

        /* Garantir que imagens sejam responsivas */
        img {
          max-width: 100%;
          height: auto;
          display: block;
        }

        .spinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* HERO */
        .hero {
          position: relative;
          height: 100vh;
          overflow: hidden;
        }

        .hero-slide {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-size: cover;
          background-position: center;
        }

        .hero-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1;
        }

        .hero-content {
          position: relative;
          z-index: 2;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          color: white;
          text-align: center;
          padding: 20px;
          animation: fadeIn 1.5s ease-in;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .hero h1 {
          font-size: 3.5rem;
          font-weight: 300;
          margin-bottom: 1rem;
        }

        .hero p {
          font-size: 1.3rem;
          margin-bottom: 2rem;
        }

        .hero-buttons {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          justify-content: center;
        }

        .btn-primary, .btn-secondary {
          padding: 15px 30px;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s;
        }

        .btn-primary {
          background: #27ae60;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #1e8449;
          transform: translateY(-3px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        }

        .btn-secondary {
          background: white;
          color: #333;
        }

        .btn-secondary:hover {
          background: #f0f0f0;
          transform: translateY(-3px);
          box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        }

        .carousel-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 3;
          background: rgba(255,255,255,0.3);
          border: none;
          color: white;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.3s;
        }

        .carousel-btn:hover {
          background: rgba(255,255,255,0.5);
        }

        .carousel-prev {
          left: 20px;
        }

        .carousel-next {
          right: 20px;
        }

        .carousel-indicators {
          position: absolute;
          bottom: 28px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 10px;
          z-index: 3;
        }

        .indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: rgba(255,255,255,0.5);
          border: none;
          cursor: pointer;
          transition: background 0.3s;
        }

        .indicator.active {
          background: white;
        }

        /* ROOMS */
        .rooms-section {
          padding: 80px 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .rooms-section h2 {
          font-size: 2.5rem;
          font-weight: 300;
          text-align: center;
          margin-bottom: 1rem;
        }

        .rooms-section > p {
          text-align: center;
          font-size: 1.1rem;
          color: #666;
          margin-bottom: 3rem;
        }

        .rooms-grid {
          display: grid;
          gap: 40px;
        }

        .room-card {
          background: white;
          border-radius: 10px;
          box-shadow: 0 5px 20px rgba(0,0,0,0.1);
          overflow: hidden;
          transition: transform 0.3s, box-shadow 0.3s;
        }

        .room-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }

        .room-header {
          background: #f8f9fa;
          padding: 30px;
          font-size: 1.5rem;
          font-weight: 600;
          border-bottom: 1px solid #e0e0e0;
        }

        .room-carousel {
          position: relative;
          height: 500px;
          overflow: hidden;
        }

        .room-carousel img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .room-carousel .carousel-btn {
          width: 40px;
          height: 40px;
        }

        .room-carousel .carousel-indicators {
          bottom: 15px;
        }

        .room-info {
          padding: 30px;
        }

        .room-location {
          color: #666;
          margin-bottom: 0.5rem;
        }

        .room-specs {
          color: #666;
          margin-bottom: 1rem;
        }

        .divider {
          height: 1px;
          background: #e0e0e0;
          margin: 1.5rem 0;
        }

        .room-highlights {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .highlight {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }

        .highlight-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .room-description {
          color: #666;
          margin: 1rem 0;
        }

        .btn-text {
          background: none;
          border: none;
          color: #27ae60;
          text-decoration: underline;
          cursor: pointer;
          font-size: 1rem;
        }

        /* BENEFITS */
        .benefits-section {
          padding: 80px 20px;
          background: #f8f9fa;
        }

        .benefits-section h2 {
          font-size: 2.5rem;
          font-weight: 300;
          text-align: center;
          margin-bottom: 3rem;
        }

        .benefits-grid {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 30px;
        }

        .benefit-card {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 5px 20px rgba(0,0,0,0.1);
          text-align: center;
          transition: transform 0.3s, background 0.3s;
        }

        .benefit-card:hover {
          transform: translateY(-5px);
          background: #e8f5e9;
        }

        .benefit-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .benefit-card h3 {
          font-size: 1.2rem;
          margin-bottom: 0.5rem;
        }

        .benefit-card p {
          color: #666;
        }

        /* TESTIMONIALS */
        .testimonials-section {
          padding: 80px 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .testimonials-section h2 {
          font-size: 2.5rem;
          font-weight: 300;
          text-align: center;
          margin-bottom: 3rem;
        }

        .testimonials-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 30px;
          margin-bottom: 2rem;
        }

        .testimonial-card {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 5px 20px rgba(0,0,0,0.1);
        }

        .testimonial-text {
          font-style: italic;
          color: #666;
          margin-bottom: 1.5rem;
        }

        .testimonial-author {
          display: flex;
          align-items: center;
          gap: 15px;
          margin-bottom: 1rem;
        }

        .author-avatar {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: #27ae60;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          font-weight: bold;
        }

        .author-name {
          font-weight: 600;
        }

        .author-location {
          font-size: 0.9rem;
          color: #666;
        }

        .testimonial-stars {
          color: #ffd700;
          font-size: 1.2rem;
        }

        .testimonials-note {
          text-align: center;
          color: #666;
          font-size: 0.9rem;
        }

        /* RESERVATION */
        .reservation-section {
          min-height: 95vh;
          background: linear-gradient(135deg, #fa6866 0%, #fd8365 100%);
          padding: 80px 20px;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .reservation-cards {
          display: flex;
          flex-wrap: wrap;
          gap: 30px;
          justify-content: center;
          max-width: 1800px;
        }

        .reservation-card {
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(10px);
          border-radius: 24px;
          padding: 32px 28px;
          flex: 1 1 320px;
          max-width: 420px;
          color: white;
        }

        .reservation-card h3 {
          font-size: 1.8rem;
          margin-bottom: 0.5rem;
        }

        .card-subtitle {
          font-size: 0.9rem;
          opacity: 0.9;
          margin-bottom: 1.5rem;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 12px;
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 8px;
          background: rgba(255,255,255,0.1);
          color: white;
          font-size: 1rem;
          cursor: pointer;
        }

        .form-group input::placeholder {
          color: rgba(255,255,255,0.7);
        }

        .form-group select option {
          background: #333;
          color: white;
        }

        .checkin-times {
          background: rgba(255,255,255,0.2);
          padding: 12px;
          border-radius: 8px;
          text-align: center;
          margin-bottom: 1.5rem;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }

        .btn-select {
          width: 100%;
          padding: 12px;
          background: rgba(255,255,255,0.2);
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 8px;
          color: white;
          font-size: 1rem;
          cursor: pointer;
          margin-bottom: 1.5rem;
          transition: all 0.3s;
        }

        .btn-select:hover {
          background: rgba(255,255,255,0.3);
        }

        .extras-section,
        .transfer-section {
          margin-bottom: 1.5rem;
        }

        .extras-section h4,
        .transfer-section h4 {
          margin-bottom: 1rem;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 0.5rem;
          cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
          width: 20px;
          height: 20px;
          cursor: pointer;
        }

        .transfer-btn {
          width: 100%;
          padding: 12px;
          margin-bottom: 10px;
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 8px;
          background: rgba(255,255,255,0.1);
          color: white;
          cursor: pointer;
          transition: all 0.3s;
        }

        .transfer-btn.active {
          background: linear-gradient(135deg, #3498db, #2d8fcb);
          animation: pulse 2s infinite;
        }

        .price-summary {
          background: rgba(255,255,255,0.1);
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        .price-summary h4 {
          margin-bottom: 1rem;
        }

        .price-line {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .price-line.total {
          font-size: 1.3rem;
          font-weight: bold;
          padding-top: 0.5rem;
          border-top: 1px solid rgba(255,255,255,0.3);
          margin-top: 0.5rem;
        }

        .btn-reserve {
          width: 100%;
          padding: 15px;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .btn-reserve:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .error-message {
          color: #ff6b6b;
          background: rgba(255,255,255,0.9);
          padding: 10px;
          border-radius: 5px;
          margin-bottom: 1rem;
          text-align: center;
        }

        .whatsapp-note {
          text-align: center;
          font-size: 0.9rem;
          opacity: 0.8;
          margin-top: 1rem;
        }

        /* ---------- OVERLAYS (garante que o calendário fica acima de tudo) ---------- */
        .calendar-overlay, .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2147483646; /* alto */
        }
        .calendar-overlay { z-index: 2147483647; } /* garantir prioridade máxima para calendário fullscreen */

        /* ---------- CALENDAR MODAL ---------- */
        .modal-content.calendar-modal {
          background: #fff;
          border-radius: 12px;
          width: min(920px, 96%);
          max-width: 920px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        /* Fullscreen para mobile: ocupa 100% viewport sem sobreposição */
        .modal-content.calendar-modal.fullscreen {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          max-width: 100vw;
          max-height: 100vh;
          margin: 0;
          border-radius: 0;
          padding: env(safe-area-inset-top) 12px env(safe-area-inset-bottom) 12px;
          z-index: 2147483647;
          box-shadow: none;
          display: flex;
          flex-direction: column;
          background: #fff;
          overflow: hidden;
        }

        /* Header fixo / visível */
        .calendar-header {
          display: grid;
          grid-template-columns: 44px 1fr auto;
          gap: 8px;
          align-items: center;
          padding: 8px 4px;
          background: #fff;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .calendar-header h3 { text-align: center; margin: 0; font-size: 1.05rem; font-weight: 600; }

        /* Dia-nome */
        .calendar-day-name { text-align: center; font-weight: 600; padding: 6px 4px; color: #666; font-size: 0.85rem; }
        
        .calendar-day.empty { background: transparent; border: none; cursor: default; }
        .calendar-day.available:hover { background: #e8f5e9; transform: scale(1.02); }
        .calendar-day.reserved { background: #e74c3c; color: #fff; cursor: not-allowed; }
        .calendar-day.selected { background: #27ae60; color: #fff; }
        .calendar-day.today { box-shadow: inset 0 0 0 2px #e74c3c; }
        .calendar-day.past { opacity: 0.45; cursor: not-allowed; }

        .day-number { font-size: 0.95rem; font-weight: 700; }
        .day-price { font-size: 0.75rem; margin-top: 4px; }

        /* Quando fullscreen: força grid-auto-rows a usar o valor calculado e não permitir scroll interno (garante que todas as linhas fiquem visíveis) */
        .modal-content.calendar-modal.fullscreen .calendar-body { overflow: hidden; }
        
        /* ---------- FIX DEFINITIVO DO CALENDÁRIO ---------- */

       /* Corpo do calendário SEM scroll */
       .calendar-body {
         flex: 1;
         overflow: hidden;
         padding: 8px;
       }

       /* Grid travado: 7 colunas × 6 linhas */
       .calendar-grid {
         display: grid;
         grid-template-columns: repeat(7, 1fr);
         grid-template-rows: repeat(6, 1fr);
         gap: 6px;
         height: 100%;
       }

       /* Células de dia */
       .calendar-day {
         display: flex;
         align-items: center;
         justify-content: center;
         border: 1.5px solid #e0e0e0;
         border-radius: 10px;
         background: #fff;
         box-sizing: border-box;
         overflow: hidden;
       }
   
       /* NÚMERO DO DIA — COR E TAMANHO CORRETOS */
       .day-number {
         font-size: clamp(12px, 2.5vw, 14px);
         font-weight: 700;
         color: #333;
         line-height: 1;
       }

       /* PREÇO — MENOR E DISCRETO */
       .day-price {
         font-size: 11px;
         margin-top: 2px;
         color: #666;
       }

       /* Estados */
       .calendar-day.reserved {
         background: #e74c3c;
         color: #fff;
       }

       .calendar-day.selected {
         background: #27ae60;
         color: #fff;
       }

       .calendar-day.today {
         box-shadow: inset 0 0 0 2px #27ae60;
       }

       .calendar-day.past {
         opacity: 0.4;
         cursor: not-allowed;
       }
        
        /* Beds Modal */
        .beds-modal {
          max-width: 900px;
        }

        .beds-container {
          display: grid;
          gap: 30px;
          margin: 2rem 0;
        }

        .beds-section h4 {
          margin-bottom: 1rem;
        }

        .beds-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
          gap: 15px;
        }

        .bed-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 10px;
          border-radius: 8px;
          transition: transform 0.3s;
        }

        .bed-item:hover:not(:disabled) {
          transform: scale(1.05);
        }

        .bed-item:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .bed-item.selected svg rect {
          fill: #27ae60;
        }

        .bed-item.reserved svg rect {
          fill: #e74c3c;
        }

        .bed-icon {
          width: 24px;
          height: 24px;
          margin-bottom: 5px;
          object-fit: contain;
        }

        .beds-legend {
          display: flex;
          gap: 20px;
          justify-content: center;
          margin: 2rem 0;
        }

        .legend-box {
          width: 20px;
          height: 20px;
          border-radius: 4px;
          display: inline-block;
          margin-right: 5px;
        }

        .legend-box.available {
          background: #add8e6;
        }

        .legend-box.selected {
          background: #27ae60;
        }

        .legend-box.reserved {
          background: #e74c3c;
        }

        .modal-actions {
          display: flex;
          gap: 15px;
          justify-content: flex-end;
        }

      /* Suites Modal */
        .suites-modal {
         max-width: 900px;

       }
        .suites-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 20px;
          margin: 2rem 0;
        }

        .suite-item {
          background: #f8f9fa;
          border: 3px solid #e0e0e0;
          border-radius: 12px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.3s;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        .suite-item:hover:not(:disabled) {
          transform: scale(1.05);
        }

        .suite-item:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .suite-item.selected {
          background: #27ae60;
          color: white;
          border-color: #27ae60;
        }

        .suite-item.reserved {
          background: #e74c3c;
          color: white;
          border-color: #e74c3c;
        }

        .suite-icon {
          width: 48px;
          height: 48px;
          object-fit: contain;
        }

        .suite-label {
          font-size: 1.5rem;
          font-weight: bold;
        }

        .suite-price {
          font-size: 0.9rem;
        }

        /* Lightbox */
        .lightbox {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0,0,0,0.95);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 2000;
        }

        .lightbox img {
          max-width: 90%;
          max-height: 90%;
          object-fit: contain;
        }

        .lightbox-close {
          position: absolute;
          top: 20px;
          right: 20px;
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.3s;
        }

        .lightbox-close:hover {
          background: rgba(255,255,255,0.3);
        }

        .lightbox .carousel-btn {
          background: rgba(255,255,255,0.2);
        }

        .lightbox .carousel-btn:hover {
          background: rgba(255,255,255,0.3);
        }

        /* Footer */
        footer {
          background: #333;
          color: white;
          padding: 40px 20px;
          text-align: center;
        }

        /* Alert Banner */
        .alert-banner {
          background: #fff3cd;
          border: 1px solid #ffc107;
          color: #856404;
          padding: 15px 20px;
          text-align: center;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        /* ========== RESPONSIVIDADE MOBILE ========== */
        @media (max-width: 768px) {
          
        /* CALENDÁRIO MOBILE — TRAVADO SEM SCROLL */
        .calendar-modal {
          height: 100vh;
        }

        .calendar-body {
          height: calc(100vh - 120px);
        }
          
          /* Hero Section - Mobile */
          .hero {
            height: 100vh;
            height: 100dvh; /* Dynamic viewport height */
          }

          .hero h1 {
            font-size: 2rem;
            padding: 0 20px;
            line-height: 1.2;
          }

          .hero p {
            font-size: 1rem;
            padding: 0 20px;
          }

          .hero-buttons {
            flex-direction: column;
            width: 100%;
            max-width: 300px;
            padding: 0 20px;
          }

          .btn-primary, .btn-secondary {
            width: 100%;
            padding: 14px 24px;
            font-size: 0.95rem;
          }

          .carousel-btn {
            width: 40px;
            height: 40px;
          }

          .carousel-prev {
            left: 10px;
          }

          .carousel-next {
            right: 10px;
          }

          .carousel-indicators {
            bottom: 20px;
          }

          /* Rooms Section - Mobile */
          .rooms-section {
            padding: 40px 16px;
          }

          .rooms-section h2 {
            font-size: 1.8rem;
            padding: 0 10px;
          }

          .rooms-section > p {
            font-size: 1rem;
            padding: 0 10px;
            margin-bottom: 2rem;
          }

          .rooms-grid {
            gap: 30px;
          }

          .room-card {
            margin: 0 auto;
            max-width: 100%;
          }

          .room-header {
            padding: 20px;
            font-size: 1.3rem;
          }

          .room-carousel {
            height: 300px;
          }

          .room-carousel .carousel-btn {
            width: 36px;
            height: 36px;
          }

          .room-info {
            padding: 20px;
          }

          .highlight {
            flex-direction: row;
            align-items: flex-start;
          }

          .highlight-icon {
            font-size: 1.3rem;
          }

          /* Benefits Section - Mobile */
          .benefits-section {
            padding: 40px 16px;
          }

          .benefits-section h2 {
            font-size: 1.8rem;
            margin-bottom: 2rem;
          }

          .benefits-grid {
            grid-template-columns: 1fr;
            gap: 20px;
          }

          .benefit-card {
            padding: 24px;
          }

          .benefit-icon {
            font-size: 2.5rem;
          }

          .benefit-card h3 {
            font-size: 1.1rem;
          }

          /* Testimonials Section - Mobile */
          .testimonials-section {
            padding: 40px 16px;
          }

          .testimonials-section h2 {
            font-size: 1.8rem;
            margin-bottom: 2rem;
          }

          .testimonials-grid {
            grid-template-columns: 1fr;
            gap: 20px;
          }

          .testimonial-card {
            padding: 24px;
          }

          .testimonial-text {
            font-size: 0.95rem;
          }

          /* Reservation Section - Mobile */
          .reservation-section {
            padding: 40px 16px;
            min-height: auto;
          }

          .reservation-cards {
            flex-direction: column;
            gap: 24px;
            width: 100%;
          }

          .reservation-card {
            max-width: 100%;
            width: 100%;
            padding: 24px 20px;
          }

          .reservation-card h3 {
            font-size: 1.5rem;
          }

          .form-group input,
          .form-group select {
            font-size: 16px; /* Evita zoom no iOS */
            padding: 14px;
          }

          .btn-reserve {
            padding: 16px;
            font-size: 1rem;
          }

          .price-summary {
            padding: 16px;
          }

          .price-line {
            font-size: 0.95rem;
          }

          .price-line.total {
            font-size: 1.2rem;
          }

          /* Beds Modal - Mobile */
          .beds-modal {
            width: 100%;
            max-width: 100%;
            margin: 20px;
            max-height: 90vh;
            overflow-y: auto;
          }

          .beds-grid {
            grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
            gap: 10px;
          }

          .bed-item {
            padding: 8px;
          }

          .bed-icon {
            width: 20px;
            height: 20px;
          }

          .modal-actions {
            flex-direction: column;
            gap: 10px;
          }

          .modal-actions button {
            width: 100%;
          }

          /* Suites Modal - Mobile */
          .suites-modal {
            width: 100%;
            max-width: 100%;
            margin: 20px;
            max-height: 90vh;
            overflow-y: auto;
          }

          .suites-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }

          .suite-item {
            padding: 16px;
          }

          /* Lightbox - Mobile */
          .lightbox img {
            max-width: 95%;
            max-height: 85%;
          }

          .lightbox-close {
            top: 10px;
            right: 10px;
            width: 44px;
            height: 44px;
          }

          .lightbox .carousel-btn {
            width: 44px;
            height: 44px;
          }

          /* Footer - Mobile */
          footer {
            padding: 30px 20px;
            font-size: 0.95rem;
          }

          footer h3 {
            font-size: 1.3rem;
          }

          /* Modal Geral - Mobile */
          .modal-content {
            width: 95%;
            max-width: 95%;
            margin: 20px;
            max-height: 90vh;
            overflow-y: auto;
          }

          .modal-close {
            top: 10px;
            right: 10px;
          }

          /* Ajustes gerais de texto */
          body {
            font-size: 16px;
            -webkit-text-size-adjust: 100%;
          }

          h1, h2, h3, h4, h5, h6 {
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* Evitar zoom indesejado em inputs no iOS */
          input, select, textarea {
            font-size: 16px !important;
          }

          /* Melhorar toque em botões */
          button, a, .btn-primary, .btn-secondary, .btn-text {
            min-height: 44px;
            min-width: 44px;
          }
        }

        /* Landscape Mobile (paisagem) */
        @media (max-width: 768px) and (orientation: landscape) {
          .hero {
            height: 100vh;
          }

          .hero h1 {
            font-size: 1.8rem;
          }

          .hero p {
            font-size: 0.9rem;
          }

          .hero-buttons {
            flex-direction: row;
            max-width: 100%;
            gap: 10px;
          }

          .btn-primary, .btn-secondary {
            padding: 12px 20px;
            font-size: 0.9rem;
          }
        }

        /* Extra small devices (menos de 375px) */
        @media (max-width: 375px) {
          .hero h1 {
            font-size: 1.6rem;
          }

          .rooms-section h2,
          .benefits-section h2,
          .testimonials-section h2 {
            font-size: 1.5rem;
          }

          .room-header {
            font-size: 1.2rem;
            padding: 16px;
          }

          .reservation-card {
            padding: 20px 16px;
          }

          .reservation-card h3 {
            font-size: 1.3rem;
          }
        }
      `}</style>

      {error && (
        <div className="alert-banner">
          ⚠️ {error} O sistema está usando valores padrão.
        </div>
      )}

      <Hero />

      <section className="rooms-section" id="rooms-section">
        <h2>Nossos quartos</h2>
        <p>Escolha o Hostel perfeito para sua experiência inesquecível!</p>
        <div className="rooms-grid">
          {roomsData.map((room, idx) => (
            <RoomCard
              key={idx}
              {...room}
              onShowMore={() => setShowModal(room.name)}
            />
          ))}
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
        <p style={{marginTop: '20px', opacity: 0.7}}>© 2025 FreiSa Hostel. Todos os direitos reservados.</p>
      </footer>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal-content calendar-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModal(null)}><X /></button>
            <h2 style={{marginBottom: '1rem'}}>{showModal}</h2>
            <div style={{lineHeight: 1.8, color: '#666', whiteSpace: 'pre-line'}}>
              {roomsData.find(r => r.name === showModal)?.fullDescription || ''}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
