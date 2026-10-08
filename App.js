import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Modal,
  Platform,
  Linking,
  Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

// Logo oficial de Pescadería Batequis
const LOGO_IMG = require('./assets/logo.png');

// Configuración de Firebase
import { db, auth } from './firebaseConfig';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

// Estructura de horas para recolección (jornada completa de 7 AM a 11 PM)
const HORAS_JORNADA = [
  { horaStr: '07', ampm: 'AM', hora24: 7 },
  { horaStr: '08', ampm: 'AM', hora24: 8 },
  { horaStr: '09', ampm: 'AM', hora24: 9 },
  { horaStr: '10', ampm: 'AM', hora24: 10 },
  { horaStr: '11', ampm: 'AM', hora24: 11 },
  { horaStr: '12', ampm: 'PM', hora24: 12 },
  { horaStr: '01', ampm: 'PM', hora24: 13 },
  { horaStr: '02', ampm: 'PM', hora24: 14 },
  { horaStr: '03', ampm: 'PM', hora24: 15 },
  { horaStr: '04', ampm: 'PM', hora24: 16 },
  { horaStr: '05', ampm: 'PM', hora24: 17 },
  { horaStr: '06', ampm: 'PM', hora24: 18 },
  { horaStr: '07', ampm: 'PM', hora24: 19 },
  { horaStr: '08', ampm: 'PM', hora24: 20 },
  { horaStr: '09', ampm: 'PM', hora24: 21 },
  { horaStr: '10', ampm: 'PM', hora24: 22 },
  { horaStr: '11', ampm: 'PM', hora24: 23 },
];

const MINUTOS_INTERVALOS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

// Helper para obtener fecha de hoy en formato local YYYY-MM-DD
const obtenerFechaHoyStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper para extraer de forma inteligente los campos bancarios si vienen en texto plano
const parsearDatosBancarios = (texto) => {
  if (!texto) return { banco: 'BBVA', tarjeta: '', clabe: '', titular: 'Pescadería Batequis' };
  let banco = '';
  let tarjeta = '';
  let clabe = '';
  let titular = '';

  const lineas = texto.split('\n');
  lineas.forEach((linea) => {
    const l = linea.trim();
    if (/^banco\s*:/i.test(l)) {
      banco = l.replace(/^banco\s*:/i, '').trim();
    } else if (/^tarjeta\s*:/i.test(l)) {
      tarjeta = l.replace(/^tarjeta\s*:/i, '').trim();
    } else if (/^clabe\s*:/i.test(l)) {
      clabe = l.replace(/^clabe\s*:/i, '').trim();
    } else if (/^titular\s*:/i.test(l)) {
      titular = l.replace(/^titular\s*:/i, '').trim();
    }
  });

  if (!tarjeta) {
    const matchTarjeta = texto.match(/\b(?:\d[ -]*?){16}\b/);
    if (matchTarjeta) tarjeta = matchTarjeta[0].replace(/[^0-9]/g, '');
  }
  if (!clabe) {
    const matchClabe = texto.match(/\b\d{18}\b/);
    if (matchClabe) clabe = matchClabe[0];
  }

  return {
    banco: banco || 'BBVA',
    tarjeta: tarjeta || '1234 5678 9012 3456',
    clabe: clabe || '012180012345678901',
    titular: titular || 'Pescadería Batequis'
  };
};

export default function App() {
  // --- AUTENTICACIÓN ADMIN ---
  const [isAdmin, setIsAdmin] = useState(false);
  const [modalLoginVisible, setModalLoginVisible] = useState(false);
  const [emailAdmin, setEmailAdmin] = useState('');
  const [passwordAdmin, setPasswordAdmin] = useState('');

  // --- DATOS EN TIEMPO REAL (FIRESTORE) ---
  const [productos, setProductos] = useState([]);
  const [horariosOcupadosDocs, setHorariosOcupadosDocs] = useState([]); // Solo turnos del día de hoy
  const [telefonoContacto, setTelefonoContacto] = useState('6871689334');

  // Datos bancarios estructurados
  const [bancoNombre, setBancoNombre] = useState('BBVA');
  const [bancoTarjeta, setBancoTarjeta] = useState('1234 5678 9012 3456');
  const [bancoClabe, setBancoClabe] = useState('012180012345678901');
  const [bancoTitular, setBancoTitular] = useState('Pescadería Batequis');
  const [datosBancarios, setDatosBancarios] = useState(
    'Banco: BBVA\nTarjeta: 1234 5678 9012 3456\nCLABE: 012180012345678901\nTitular: Pescadería Batequis'
  );

  const [urlUbicacion, setUrlUbicacion] = useState('https://maps.google.com');

  // Configuración de integración con Telegram (para notificación directa de pedidos)
  const [telegramBotToken, setTelegramBotToken] = useState('8611799573:AAHifFtfK3mXUXxlmXEUeE2CO5_u3wIsyjk');
  const [telegramChatId, setTelegramChatId] = useState('-5409202124');
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [comprobanteTransferencia, setComprobanteTransferencia] = useState(null);

  // Configuración de horario y estado del negocio
  const [horaApertura, setHoraApertura] = useState(9); // 9 AM
  const [horaCierre, setHoraCierre] = useState(23);    // 11 PM
  const [modoForzadoEstado, setModoForzadoEstado] = useState('auto'); // 'auto', 'abierto', 'cerrado'
  const [estaAbierto, setEstaAbierto] = useState(true);

  // --- RELOJ EN TIEMPO REAL (MINUTOS DEL DÍA DESDE MEDIANOCHE) ---
  const [minutosActualesDelDia, setMinutosActualesDelDia] = useState(() => {
    const ahora = new Date();
    return ahora.getHours() * 60 + ahora.getMinutes();
  });

  useEffect(() => {
    const tickReloj = () => {
      const ahora = new Date();
      setMinutosActualesDelDia(ahora.getHours() * 60 + ahora.getMinutes());
    };
    tickReloj();
    const intervalId = setInterval(tickReloj, 15000); // Se actualiza cada 15 segundos
    return () => clearInterval(intervalId);
  }, []);

  // --- REFERENCIA PARA DESPLAZAMIENTO SUAVE ---
  const mainScrollRef = useRef(null);

  // --- DATOS DEL CLIENTE E HISTORIAL ---
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [historialPedidos, setHistorialPedidos] = useState([]);

  // --- BÚSQUEDA Y FILTROS CLIENTE ---
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [filtroDisponibilidad, setFiltroDisponibilidad] = useState('todos'); // 'todos', 'disponibles'
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas'); // 'todas', 'preparados', 'camaron', 'pescado', 'pulpo', 'complementos'
  const [notasPedido, setNotasPedido] = useState('');

  // --- ESTADO DEL CARRITO ---
  const [carrito, setCarrito] = useState([]);
  const [modalAgregarItem, setModalAgregarItem] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [cantidadInput, setCantidadInput] = useState('');
  const [unidadSeleccionada, setUnidadSeleccionada] = useState('Kg');
  const [metodoPago, setMetodoPago] = useState('efectivo');

  // --- FEEDBACK DE COPIADO INDIVIDUAL ---
  const [campoCopiado, setCampoCopiado] = useState(null); // 'banco', 'tarjeta', 'clabe', 'titular', 'todo'

  // --- SELECTOR DE HORARIO DINÁMICO ---
  const [horaSeleccionada, setHoraSeleccionada] = useState(null);
  const [modalHoraVisible, setModalHoraVisible] = useState(false);
  const [horaBloqueActivo, setHoraBloqueActivo] = useState(HORAS_JORNADA[0]);

  // --- MODAL DE CONFIRMACIÓN / TICKET DIGITAL ---
  const [modalTicketVisible, setModalTicketVisible] = useState(false);
  const [ticketActual, setTicketActual] = useState(null);
  const [copiadoFeedback, setCopiadoFeedback] = useState(false);

  // --- NOTIFICACIÓN PERSONALIZADA ---
  const [alertaModal, setAlertaModal] = useState({ visible: false, titulo: '', mensaje: '', tipo: 'info' });

  // --- PANEL DE ADMINISTRACIÓN ---
  const [adminTab, setAdminTab] = useState('catalogo'); // 'catalogo', 'horarios', 'config'
  const [modalNuevoProducto, setModalNuevoProducto] = useState(false);
  const [nombreNuevoProd, setNombreNuevoProd] = useState('');
  const [precioNuevoProd, setPrecioNuevoProd] = useState('');
  const [unidadNuevoProd, setUnidadNuevoProd] = useState('Kg');
  const [categoriaNuevoProd, setCategoriaNuevoProd] = useState('preparados');

  const [modalEditarPrecio, setModalEditarPrecio] = useState(false);
  const [productoAEditar, setProductoAEditar] = useState(null);
  const [nuevoPrecioInput, setNuevoPrecioInput] = useState('');

  const [modalEditarTelefono, setModalEditarTelefono] = useState(false);
  const [nuevoTelefonoInput, setNuevoTelefonoInput] = useState('');

  // Estados para modal de edición de banco individual
  const [modalEditarBanco, setModalEditarBanco] = useState(false);
  const [inputBancoNombre, setInputBancoNombre] = useState('');
  const [inputBancoTarjeta, setInputBancoTarjeta] = useState('');
  const [inputBancoClabe, setInputBancoClabe] = useState('');
  const [inputBancoTitular, setInputBancoTitular] = useState('');

  const [modalEditarUbicacion, setModalEditarUbicacion] = useState(false);
  const [nuevaUbicacionInput, setNuevaUbicacionInput] = useState('');

  const [modalEditarHorarios, setModalEditarHorarios] = useState(false);
  const [nuevaAperturaInput, setNuevaAperturaInput] = useState('9');
  const [nuevoCierreInput, setNuevoCierreInput] = useState('23');

  // Helper para mostrar avisos sin bloquear la ejecución en Web / PWA
  const mostrarAviso = (titulo, mensaje, tipo = 'info') => {
    setAlertaModal({ visible: true, titulo, mensaje, tipo });
  };

  // 1. Escuchar sesión de Admin
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!user);
    });
    return () => unsubscribeAuth();
  }, []);

  // 2. Escuchar productos
  useEffect(() => {
    const unsubscribeProductos = onSnapshot(collection(db, 'productos'), (snapshot) => {
      const lista = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setProductos(lista);
    });
    return () => unsubscribeProductos();
  }, []);

  // 3. Escuchar horarios ocupados con LIBERACIÓN AUTOMÁTICA DE DÍAS ANTERIORES
  useEffect(() => {
    const hoyStr = obtenerFechaHoyStr();
    const unsubscribeHorarios = onSnapshot(collection(db, 'horarios_ocupados'), (snapshot) => {
      const listaHoy = [];
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const esDeHoy = data.fecha
          ? data.fecha === hoyStr
          : data.fechaRegistro
            ? data.fechaRegistro.startsWith(hoyStr)
            : false;

        if (esDeHoy) {
          listaHoy.push({
            id: docSnap.id,
            ...data
          });
        } else {
          // Si el horario es de días anteriores, se libera y elimina automáticamente de Firestore
          deleteDoc(doc(db, 'horarios_ocupados', docSnap.id)).catch(() => {});
        }
      });
      setHorariosOcupadosDocs(listaHoy);
    });
    return () => unsubscribeHorarios();
  }, []);

  // Lista simple de horas ocupadas exclusivamente para hoy
  const listaHorasOcupadas = useMemo(() => {
    return horariosOcupadosDocs.map((item) => item.hora);
  }, [horariosOcupadosDocs]);

  // 4. Escuchar configuración general (incluyendo datos bancarios individuales)
  useEffect(() => {
    const unsubscribeConfig = onSnapshot(doc(db, 'configuracion', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.telefono) setTelefonoContacto(data.telefono);
        if (data.urlUbicacion) setUrlUbicacion(data.urlUbicacion);
        if (data.horaApertura !== undefined) setHoraApertura(Number(data.horaApertura));
        if (data.horaCierre !== undefined) setHoraCierre(Number(data.horaCierre));
        if (data.modoForzadoEstado) setModoForzadoEstado(data.modoForzadoEstado);
        if (data.telegramBotToken) setTelegramBotToken(data.telegramBotToken);
        if (data.telegramChatId) setTelegramChatId(data.telegramChatId);

        // Campos bancarios individuales y backward-compatibility
        if (data.bancoNombre) setBancoNombre(data.bancoNombre);
        if (data.bancoTarjeta) setBancoTarjeta(data.bancoTarjeta);
        if (data.bancoClabe) setBancoClabe(data.bancoClabe);
        if (data.bancoTitular) setBancoTitular(data.bancoTitular);
        if (data.datosBancarios) {
          setDatosBancarios(data.datosBancarios);
          const parsed = parsearDatosBancarios(data.datosBancarios);
          if (!data.bancoNombre && parsed.banco) setBancoNombre(parsed.banco);
          if (!data.bancoTarjeta && parsed.tarjeta) setBancoTarjeta(parsed.tarjeta);
          if (!data.bancoClabe && parsed.clabe) setBancoClabe(parsed.clabe);
          if (!data.bancoTitular && parsed.titular) setBancoTitular(parsed.titular);
        }
      }
    });
    return () => unsubscribeConfig();
  }, []);

  // Datos bancarios unificados para mostrar
  const datosBancariosEstructurados = useMemo(() => {
    if (bancoNombre || bancoTarjeta || bancoClabe || bancoTitular) {
      return {
        banco: bancoNombre || 'BBVA',
        tarjeta: bancoTarjeta || '',
        clabe: bancoClabe || '',
        titular: bancoTitular || 'Pescadería Batequis'
      };
    }
    return parsearDatosBancarios(datosBancarios);
  }, [bancoNombre, bancoTarjeta, bancoClabe, bancoTitular, datosBancarios]);

  // 5. Evaluar estado de apertura del negocio
  useEffect(() => {
    const evaluarEstadoNegocio = () => {
      if (modoForzadoEstado === 'abierto') {
        setEstaAbierto(true);
        return;
      }
      if (modoForzadoEstado === 'cerrado') {
        setEstaAbierto(false);
        return;
      }
      const ahora = new Date();
      const horaActual = ahora.getHours();
      if (horaActual >= horaApertura && horaActual < horaCierre) {
        setEstaAbierto(true);
      } else {
        setEstaAbierto(false);
      }
    };
    evaluarEstadoNegocio();
    const intervalo = setInterval(evaluarEstadoNegocio, 30000);
    return () => clearInterval(intervalo);
  }, [horaApertura, horaCierre, modoForzadoEstado]);

  // 6. Cargar datos de cliente guardados e historial local
  useEffect(() => {
    cargarDatosClienteGuardados();
    cargarHistorialLocal();
  }, []);

  const cargarDatosClienteGuardados = async () => {
    try {
      const nombreGuardado = await AsyncStorage.getItem('@nombre_cliente');
      if (nombreGuardado) {
        setNombreCliente(nombreGuardado);
      }
      const telGuardado = await AsyncStorage.getItem('@telefono_cliente');
      if (telGuardado) {
        setTelefonoCliente(telGuardado);
      }
    } catch (e) {
      console.log('Error cargando datos de cliente guardados', e);
    }
  };

  const handleCambioNombreCliente = (texto) => {
    setNombreCliente(texto);
    AsyncStorage.setItem('@nombre_cliente', texto).catch(() => {});
  };

  const handleCambioTelefonoCliente = (texto) => {
    setTelefonoCliente(texto);
    AsyncStorage.setItem('@telefono_cliente', texto).catch(() => {});
  };

  const cargarHistorialLocal = async () => {
    try {
      const guardado = await AsyncStorage.getItem('@historial_pedidos');
      if (guardado) {
        setHistorialPedidos(JSON.parse(guardado));
      }
    } catch (e) {
      console.log('Error cargando historial local', e);
    }
  };

  const guardarPedidoEnHistorial = async (nuevoPedido) => {
    try {
      const actualizado = [nuevoPedido, ...historialPedidos].slice(0, 5);
      setHistorialPedidos(actualizado);
      await AsyncStorage.setItem('@historial_pedidos', JSON.stringify(actualizado));
    } catch (e) {
      console.log('Error guardando en historial local', e);
    }
  };

  const handleRepetirPedido = (pedidoAnterior) => {
    setCarrito(pedidoAnterior.carrito || []);
    if (pedidoAnterior.nombreCliente) setNombreCliente(pedidoAnterior.nombreCliente);
    if (pedidoAnterior.telefonoCliente) setTelefonoCliente(pedidoAnterior.telefonoCliente);
    mostrarAviso('¡Pedido Cargado!', 'Se han cargado los productos de tu pedido anterior en el carrito.', 'exito');
  };

  // =========================================================================
  // DETECCIÓN INTELIGENTE DE CATEGORÍAS Y TIEMPO DE PREPARACIÓN
  // =========================================================================

  // Helper infalible para detectar productos preparados o ceviches (sin importar acentos, mayúsculas o variaciones)
  const esProductoPreparado = (item) => {
    if (!item) return false;
    const cat = String(item.categoria || '').toLowerCase().trim();
    if (
      cat === 'preparados' ||
      cat === 'ceviches' ||
      cat === 'ceviche' ||
      cat.includes('preparad') ||
      cat.includes('ceviche') ||
      cat.includes('platillo') ||
      cat.includes('cocina')
    ) {
      return true;
    }
    const n = String(item.nombre || '').toLowerCase().trim();
    const nNorm = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return (
      nNorm.includes('ceviche') ||
      nNorm.includes('atun') ||
      nNorm.includes('preparad') ||
      nNorm.includes('aguachile') ||
      nNorm.includes('coctel') ||
      nNorm.includes('torito') ||
      nNorm.includes('campechana') ||
      nNorm.includes('ensalada') ||
      nNorm.includes('tostada') ||
      nNorm.includes('botana') ||
      nNorm.includes('sashimi') ||
      nNorm.includes('mariscada') ||
      nNorm.includes('tartar') ||
      nNorm.includes('cocido')
    );
  };

  const obtenerCategoriaProducto = (prod) => {
    if (!prod) return 'pescado';
    if (esProductoPreparado(prod)) return 'preparados';
    const c = String(prod.categoria || '').toLowerCase().trim();
    if (c === 'camaron' || c.includes('camar')) return 'camaron';
    if (c === 'pescado' || c.includes('pescad') || c.includes('filete')) return 'pescado';
    if (c === 'pulpo' || c.includes('marisco')) return 'pulpo';
    if (c === 'complementos' || c.includes('complem')) return 'complementos';

    const n = String(prod.nombre || '').toLowerCase().trim();
    const nNorm = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (nNorm.includes('camaron')) return 'camaron';
    if (
      nNorm.includes('pescado') ||
      nNorm.includes('filete') ||
      nNorm.includes('posta') ||
      nNorm.includes('curvina') ||
      nNorm.includes('robalo') ||
      nNorm.includes('huachinango') ||
      nNorm.includes('lisa') ||
      nNorm.includes('mojarra') ||
      nNorm.includes('tilapia') ||
      nNorm.includes('cazon') ||
      nNorm.includes('salmon')
    ) {
      return 'pescado';
    }
    if (
      nNorm.includes('pulpo') ||
      nNorm.includes('calamar') ||
      nNorm.includes('callo') ||
      nNorm.includes('almeja') ||
      nNorm.includes('ostion') ||
      nNorm.includes('jaiba')
    ) {
      return 'pulpo';
    }
    if (
      nNorm.includes('salsa') ||
      nNorm.includes('limon') ||
      nNorm.includes('galleta') ||
      nNorm.includes('mayonesa')
    ) {
      return 'complementos';
    }
    return 'pescado';
  };

  const obtenerBadgeCategoria = (prod) => {
    const cat = obtenerCategoriaProducto(prod);
    switch (cat) {
      case 'preparados':
        return { label: '🥗 Listo para Comer', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
      case 'camaron':
        return { label: '🦐 Camarón Fresco', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' };
      case 'pescado':
        return { label: '🐟 Pescado del Día', bg: '#f0f9ff', color: '#0284c7', border: '#bae6fd' };
      case 'pulpo':
        return { label: '🐙 Especialidad', bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff' };
      case 'complementos':
        return { label: '🍋 Complemento', bg: '#fefce8', color: '#a16207', border: '#fef08a' };
      default:
        return { label: '🌊 Frescura Batequis', bg: '#f8fafc', color: '#475569', border: '#cbd5e1' };
    }
  };

  // Verifica si el cliente tiene al menos un platillo o ceviche en el carrito
  const tienePreparadosEnCarrito = useMemo(() => {
    return carrito.some((item) => esProductoPreparado(item));
  }, [carrito]);

  // Si incluye preparados/ceviches exige al menos 30 min de margen de cocina; de lo contrario 5 min
  const margenMinutosRequerido = tienePreparadosEnCarrito ? 30 : 5;

  // =========================================================================
  // LÓGICA DINÁMICA: OCULTAR HORAS Y MINUTOS PASADOS SEGÚN LA HORA DEL DÍA
  // =========================================================================

  // Minutos disponibles en el futuro para una hora dada (considerando margen de preparación estricto y hora de cierre)
  const obtenerMinutosDisponibles = (itemHora) => {
    if (!itemHora) return [];
    const ahora = new Date();
    const minActuales = ahora.getHours() * 60 + ahora.getMinutes();
    const margen = tienePreparadosEnCarrito ? 30 : 5;
    const minMaxCierre = horaCierre * 60;

    return MINUTOS_INTERVALOS.filter((minStr) => {
      const minEntero = parseInt(minStr, 10);
      const totalMinutosTurno = itemHora.hora24 * 60 + minEntero;
      // No debe ser posterior a la hora de cierre
      if (totalMinutosTurno > minMaxCierre) return false;
      // Cualquier turno a menos de 30 min (si hay preparados) o menos de 5 min (normal) es estrictamente descartado
      return (totalMinutosTurno - minActuales) >= margen;
    });
  };

  // Horas del día que aún tienen minutos disponibles y están en horario comercial
  const horasDisponiblesHoy = useMemo(() => {
    return HORAS_JORNADA.filter((item) => {
      if (item.hora24 < horaApertura || item.hora24 > horaCierre) {
        return false;
      }
      const minutosFuturos = obtenerMinutosDisponibles(item);
      return minutosFuturos.length > 0;
    });
  }, [horaApertura, horaCierre, minutosActualesDelDia, tienePreparadosEnCarrito]);

  // Minutos disponibles para la hora que el usuario tiene abierta en el selector
  const minutosDisponiblesBloque = useMemo(() => {
    if (!horaBloqueActivo) return [];
    return obtenerMinutosDisponibles(horaBloqueActivo);
  }, [horaBloqueActivo, minutosActualesDelDia, tienePreparadosEnCarrito, horaCierre]);

  // Si la hora activa ya expiró o no está en la lista de horas válidas, mover al primer bloque disponible
  useEffect(() => {
    if (horasDisponiblesHoy.length > 0) {
      const sigueValida = horasDisponiblesHoy.some((h) => h.hora24 === horaBloqueActivo?.hora24);
      if (!sigueValida) {
        setHoraBloqueActivo(horasDisponiblesHoy[0]);
      }
    } else {
      setHoraBloqueActivo(null);
    }
  }, [horasDisponiblesHoy, horaBloqueActivo]);

  // Si la hora que el usuario tenía seleccionada no cumple con el margen de 30 min, cancelarla inmediatamente
  useEffect(() => {
    if (horaSeleccionada) {
      const match = horaSeleccionada.match(/^(\d{2}):(\d{2})\s*(AM|PM)$/i);
      if (match) {
        let h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const ampm = match[3].toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        const totalMin = h * 60 + m;
        const ahora = new Date();
        const minActuales = ahora.getHours() * 60 + ahora.getMinutes();
        const margen = tienePreparadosEnCarrito ? 30 : 5;
        if ((totalMin - minActuales) < margen) {
          const horaCancelada = horaSeleccionada;
          setHoraSeleccionada(null);
          if (tienePreparadosEnCarrito) {
            mostrarAviso(
              'Horario Reajustado (+30 min)',
              `Se liberó el turno de las ${horaCancelada} porque al incluir ceviches o preparados la cocina requiere al menos 30 minutos de elaboración. Por favor selecciona tu nuevo turno.`,
              'info'
            );
          }
        }
      }
    }
  }, [minutosActualesDelDia, horaSeleccionada, tienePreparadosEnCarrito]);

  const abrirModalHora = () => {
    if (horasDisponiblesHoy.length > 0) {
      if (horaSeleccionada) {
        const match = horaSeleccionada.match(/^(\d{2}):(\d{2})\s*(AM|PM)$/i);
        if (match) {
          let h = parseInt(match[1], 10);
          const ampm = match[3].toUpperCase();
          if (ampm === 'PM' && h < 12) h += 12;
          if (ampm === 'AM' && h === 12) h = 0;
          const matchItem = horasDisponiblesHoy.find((item) => item.hora24 === h);
          if (matchItem) {
            setHoraBloqueActivo(matchItem);
            setModalHoraVisible(true);
            return;
          }
        }
      }
      const sigueValida = horasDisponiblesHoy.some((h) => h.hora24 === horaBloqueActivo?.hora24);
      if (!sigueValida) {
        setHoraBloqueActivo(horasDisponiblesHoy[0]);
      }
    }
    setModalHoraVisible(true);
  };

  // Turno más próximo estimado disponible (respetando margen de 30 min para preparados)
  const turnoMasProximo = useMemo(() => {
    for (const h of horasDisponiblesHoy) {
      const mins = obtenerMinutosDisponibles(h);
      for (const m of mins) {
        const turnoStr = `${h.horaStr}:${m} ${h.ampm}`;
        if (!listaHorasOcupadas.includes(turnoStr)) {
          return turnoStr;
        }
      }
    }
    return null;
  }, [horasDisponiblesHoy, listaHorasOcupadas, margenMinutosRequerido]);

  // --- FILTRADO DE PRODUCTOS ---
  const productosFiltrados = useMemo(() => {
    return productos.filter((prod) => {
      const coincideNombre = (prod.nombre || '').toLowerCase().includes(busquedaProducto.toLowerCase());
      const coincideDisp = filtroDisponibilidad === 'todos' || prod.disponible;
      const catProd = obtenerCategoriaProducto(prod);
      const coincideCat = categoriaFiltro === 'todas' || catProd === categoriaFiltro;
      return coincideNombre && coincideDisp && coincideCat;
    });
  }, [productos, busquedaProducto, filtroDisponibilidad, categoriaFiltro]);

  // --- SUBTOTAL Y CARRITO ---
  const abrirModalSeleccion = (producto) => {
    setProductoSeleccionado(producto);
    setCantidadInput('');
    const unid = producto.unidad || 'Kg';
    setUnidadSeleccionada(unid === 'Gramos' ? 'Gramos' : unid);
    setModalAgregarItem(true);
  };

  const calcularSubtotalItem = (precioBase, cantidad, unidad) => {
    const cant = parseFloat(cantidad) || 0;
    const prec = parseFloat(precioBase) || 0;
    if (['Kg', 'Pieza', 'Litro', '1/2 Litro', 'Porción', 'Orden'].includes(unidad)) return cant * prec;
    if (unidad === 'Gramos') return (cant / 1000) * prec;
    if (unidad === 'Pesos') return cant;
    return cant * prec;
  };

  const handleAgregarAlCarrito = () => {
    const cant = parseFloat(cantidadInput);
    if (!cantidadInput || isNaN(cant) || cant <= 0) {
      mostrarAviso('Cantidad Inválida', 'Por favor ingresa una cantidad mayor a 0.', 'error');
      return;
    }
    const subtotal = calcularSubtotalItem(productoSeleccionado.precio, cant, unidadSeleccionada);
    const nuevoItem = {
      idCarrito: Date.now().toString(),
      productoId: productoSeleccionado.id,
      nombre: productoSeleccionado.nombre,
      categoria: productoSeleccionado.categoria || obtenerCategoriaProducto(productoSeleccionado),
      cantidad: cant,
      unidad: unidadSeleccionada,
      subtotal: subtotal
    };

    // Si se agrega un preparado/ceviche y ya había una hora seleccionada que no cumple los 30 min, cancelarla de inmediato
    const esPreparado = esProductoPreparado(nuevoItem) || esProductoPreparado(productoSeleccionado);
    if (esPreparado && horaSeleccionada) {
      const match = horaSeleccionada.match(/^(\d{2}):(\d{2})\s*(AM|PM)$/i);
      if (match) {
        let h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const ampm = match[3].toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        const totalMin = h * 60 + m;
        const ahora = new Date();
        const minActuales = ahora.getHours() * 60 + ahora.getMinutes();
        if ((totalMin - minActuales) < 30) {
          const horaCancelada = horaSeleccionada;
          setHoraSeleccionada(null);
          mostrarAviso(
            'Turno Reajustado (+30 min)',
            `Se canceló tu turno previo de las ${horaCancelada} porque al agregar "${productoSeleccionado.nombre}" se requieren al menos 30 minutos de preparación.`,
            'info'
          );
        }
      }
    }

    setCarrito([...carrito, nuevoItem]);
    setModalAgregarItem(false);
    setProductoSeleccionado(null);
    setCantidadInput('');
  };

  const handleEliminarDelCarrito = (idCarrito) => {
    setCarrito(carrito.filter((item) => item.idCarrito !== idCarrito));
  };

  const calcularTotalCarrito = () => {
    return carrito.reduce((acc, item) => acc + item.subtotal, 0);
  };

  // --- COPIAR AL PORTAPAPELES CON INDICADOR INDIVIDUAL ---
  const copiarAlPortapapeles = async (texto, mensajeExito = 'Copiado al portapapeles', campoId = null) => {
    try {
      const textoLimpio = String(texto).trim();
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(textoLimpio);
      } else {
        if (typeof document !== 'undefined') {
          const tempInput = document.createElement('textarea');
          tempInput.value = textoLimpio;
          document.body.appendChild(tempInput);
          tempInput.select();
          document.execCommand('copy');
          document.body.removeChild(tempInput);
        }
      }
      if (campoId) {
        setCampoCopiado(campoId);
        setTimeout(() => setCampoCopiado(null), 2500);
      } else {
        setCopiadoFeedback(true);
        setTimeout(() => setCopiadoFeedback(false), 2500);
      }
      mostrarAviso('¡Copiado!', mensajeExito, 'exito');
    } catch (err) {
      mostrarAviso('Información', 'Selecciona el texto para copiarlo manualmente.');
    }
  };

  // --- APERTURA ROBUSTA DE WHATSAPP ---
  const abrirWhatsAppConMensaje = (urlWhatsApp) => {
    if (Platform.OS === 'web') {
      try {
        const win = window.open(urlWhatsApp, '_blank');
        if (!win || win.closed || typeof win.closed === 'undefined') {
          window.location.href = urlWhatsApp;
        }
      } catch (e) {
        window.location.href = urlWhatsApp;
      }
    } else {
      Linking.openURL(urlWhatsApp).catch(() => {
        mostrarAviso(
          'WhatsApp no disponible',
          'No pudimos abrir la aplicación de WhatsApp directamente. Por favor copia el texto de tu pedido con el botón "Copiar Pedido".',
          'error'
        );
      });
    }
  };

  // --- NOTIFICACIÓN DIRECTA A TELEGRAM ---
  const enviarNotificacionTelegram = async (mensajeHtml, replyMarkup = null) => {
    const token = telegramBotToken || '8611799573:AAHifFtfK3mXUXxlmXEUeE2CO5_u3wIsyjk';
    const rawChatId = telegramChatId || '-5409202124';

    // Lista de posibles formatos de Chat ID (por si Telegram requiere el prefijo -100 para supergrupos)
    const possibleChatIds = [rawChatId];
    if (rawChatId.startsWith('-') && !rawChatId.startsWith('-100')) {
      possibleChatIds.push('-100' + rawChatId.substring(1));
    }

    for (const cid of possibleChatIds) {
      try {
        const payload = {
          chat_id: cid,
          text: mensajeHtml,
          parse_mode: 'HTML'
        };
        if (replyMarkup) {
          payload.reply_markup = replyMarkup;
        }

        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.ok) {
          console.log('Pedido enviado exitosamente a Telegram, chat_id:', cid);
          return true;
        } else {
          console.warn(`Fallo al enviar a Telegram (${cid}):`, data.description);
        }
      } catch (err) {
        console.warn('Error de conexión con Telegram API:', err);
      }
    }
    return false;
  };

  // Enviar imagen del comprobante de transferencia por Telegram
  const enviarFotoTelegram = async (imageUri, captionHtml, replyMarkup = null) => {
    const token = telegramBotToken || '8611799573:AAHifFtfK3mXUXxlmXEUeE2CO5_u3wIsyjk';
    const rawChatId = telegramChatId || '-5409202124';

    try {
      const formData = new FormData();
      formData.append('chat_id', rawChatId);
      if (captionHtml) {
        formData.append('caption', captionHtml);
        formData.append('parse_mode', 'HTML');
      }
      if (replyMarkup) {
        formData.append('reply_markup', JSON.stringify(replyMarkup));
      }

      if (Platform.OS === 'web') {
        const res = await fetch(imageUri);
        const blob = await res.blob();
        formData.append('photo', blob, 'comprobante.jpg');
      } else {
        formData.append('photo', {
          uri: imageUri,
          type: 'image/jpeg',
          name: 'comprobante.jpg'
        });
      }

      const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      return !!data.ok;
    } catch (err) {
      console.warn('Error enviando comprobante a Telegram:', err);
      return false;
    }
  };

  // Selector de imagen de comprobante
  const handleSeleccionarComprobante = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted && Platform.OS !== 'web') {
        mostrarAviso('Permiso Requerido', 'Necesitamos acceso a tus imágenes para subir el comprobante.', 'error');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setComprobanteTransferencia(result.assets[0]);
        mostrarAviso('Comprobante Listo', 'Tu comprobante de pago se adjuntó con éxito y se enviará junto con el pedido.', 'exito');
      }
    } catch (error) {
      console.warn('Error al seleccionar imagen:', error);
      mostrarAviso('Error', 'No se pudo cargar la imagen. Intenta de nuevo.', 'error');
    }
  };

  const handleEliminarComprobante = () => {
    setComprobanteTransferencia(null);
  };

  // --- CONFIRMAR PEDIDO Y GENERAR TICKET ---
  const handleConfirmarPedido = async () => {
    if (!estaAbierto && !isAdmin) {
      mostrarAviso(
        'Negocio Cerrado',
        `Actualmente estamos fuera de servicio. Nuestro horario es de ${horaApertura}:00 hrs a ${horaCierre}:00 hrs.`,
        'error'
      );
      return;
    }
    if (!nombreCliente.trim()) {
      mostrarAviso('Nombre Requerido', 'Por favor ingresa el nombre de la persona que recogerá el pedido.', 'error');
      return;
    }
    const telLimpio = telefonoCliente.replace(/\D/g, '');
    if (!telLimpio || telLimpio.length < 10) {
      mostrarAviso('Teléfono Requerido', 'Por favor ingresa un número de teléfono / WhatsApp válido a 10 dígitos para contactarte sobre tu pedido.', 'error');
      return;
    }
    if (carrito.length === 0) {
      mostrarAviso('Carrito Vacío', 'Agrega al menos un producto a tu pedido para continuar.', 'error');
      return;
    }
    if (!horaSeleccionada) {
      mostrarAviso('Horario Requerido', 'Selecciona la hora estimada en la que pasarás por tu pedido.', 'error');
      return;
    }

    setEnviandoPedido(true);

    try {
      const hoyStr = obtenerFechaHoyStr();
      const notaEfectiva = tienePreparadosEnCarrito ? notasPedido.trim() : '';

      // 1. Guardar hora ocupada en Firestore vinculada a la fecha de hoy
      await addDoc(collection(db, 'horarios_ocupados'), {
        hora: horaSeleccionada,
        cliente: nombreCliente.trim(),
        telefono: telLimpio,
        total: calcularTotalCarrito(),
        notas: notaEfectiva,
        fecha: hoyStr,
        fechaRegistro: new Date().toISOString()
      });

      // 2. Generar Folio Único
      const folio = 'PB-' + Math.floor(1000 + Math.random() * 9000);
      const total = calcularTotalCarrito();
      const metodoPagoTexto = metodoPago === 'transferencia' ? '💳 Transferencia Bancaria' : '💵 Efectivo en Sucursal';
      const fechaHoyFormateada = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

      // 3. Guardar en historial local del dispositivo y asegurar persistencia del nombre y teléfono
      try {
        await AsyncStorage.setItem('@nombre_cliente', nombreCliente.trim());
        await AsyncStorage.setItem('@telefono_cliente', telLimpio);
      } catch (e) {
        console.log('Error persistiendo datos de cliente', e);
      }

      const registroLocal = {
        folio: folio,
        fecha: fechaHoyFormateada,
        nombreCliente: nombreCliente.trim(),
        telefonoCliente: telLimpio,
        total: total,
        hora: horaSeleccionada,
        notas: notaEfectiva,
        metodoPago: metodoPagoTexto,
        carrito: [...carrito]
      };
      await guardarPedidoEnHistorial(registroLocal);

      // 4. Formato de texto para respaldo
      const lineasProductos = carrito.map((item) => {
        const detalleCantidad = item.unidad === 'Pesos'
          ? `$${item.cantidad} MXN`
          : `${item.cantidad} ${item.unidad}`;
        return `• *${item.nombre}*: ${detalleCantidad} ➔ $${item.subtotal.toFixed(2)} MXN`;
      }).join('\n');

      const notasTexto = notaEfectiva
        ? `\n📝 *NOTAS PARA CEVICHE / PREPARADOS:*\n_${notaEfectiva}_\n━━━━━━━━━━━━━━━━━━━━━\n`
        : '';

      const mensajeResumen =
        `🐟 *PESCADERÍA BATEQUIS* 🐟\n` +
        `🧾 *FOLIO:* #${folio}\n` +
        `📅 *FECHA:* ${fechaHoyFormateada}\n` +
        `⏰ *HORA RECOLECCIÓN:* ${horaSeleccionada}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *CLIENTE:* ${nombreCliente.trim()}\n` +
        `📱 *TELÉFONO:* ${telLimpio}\n` +
        `💳 *MÉTODO DE PAGO:* ${metodoPagoTexto}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `🛒 *PRODUCTOS DEL PEDIDO:*\n` +
        `${lineasProductos}\n` +
        notasTexto +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 *TOTAL ESTIMADO:* $${total.toFixed(2)} MXN\n` +
        (metodoPago === 'transferencia' ? `📌 *Nota:* Pago por transferencia.\n` : '');

      // 5. ENVIAR DIRECTAMENTE A TELEGRAM AL GRUPO DE LA EMPRESA CON BOTÓN DE WHATSAPP
      const lineasHtmlTelegram = carrito.map((item) => {
        const detalleCantidad = item.unidad === 'Pesos'
          ? `$${item.cantidad} MXN`
          : `${item.cantidad} ${item.unidad}`;
        return `• <b>${item.nombre}</b>: ${detalleCantidad} ➔ <i>$${item.subtotal.toFixed(2)} MXN</i>`;
      }).join('\n');

      const notasHtml = notaEfectiva
        ? `\n━━━━━━━━━━━━━━━━━━━━━\n📝 <b>NOTAS DE PREPARACIÓN:</b>\n<i>${notaEfectiva}</i>`
        : '';

      const tieneComprobanteAdjunto = metodoPago === 'transferencia' && !!comprobanteTransferencia?.uri;

      const mensajeHtmlTelegram =
        `🐟 <b>¡NUEVO PEDIDO RECIBIDO!</b> 🐟\n\n` +
        `🧾 <b>FOLIO:</b> <code>#${folio}</code>\n` +
        `⏰ <b>HORA RECOLECCIÓN:</b> <b>${horaSeleccionada}</b>\n` +
        `📅 <b>FECHA:</b> ${fechaHoyFormateada}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>CLIENTE:</b> <b>${nombreCliente.trim()}</b>\n` +
        `📱 <b>TELÉFONO / WHATSAPP:</b> <code>${telLimpio}</code>\n` +
        `💳 <b>MÉTODO DE PAGO:</b> ${metodoPagoTexto}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `🛒 <b>PRODUCTOS:</b>\n` +
        `${lineasHtmlTelegram}\n` +
        notasHtml +
        `\n━━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 <b>TOTAL ESTIMADO:</b> <b>$${total.toFixed(2)} MXN</b>\n` +
        (tieneComprobanteAdjunto
          ? `📸 <i>Comprobante de pago adjunto en la siguiente foto 👇</i>\n`
          : metodoPago === 'transferencia'
            ? `📌 <i>El cliente pagará por transferencia bancaria.</i>\n`
            : '');

      // Botón interactivo en Telegram para abrir WhatsApp con el cliente con un solo clic
      const waUrlCliente = `https://wa.me/52${telLimpio}?text=${encodeURIComponent(`Hola ${nombreCliente.trim()}, te escribimos de Pescadería Batequis sobre tu pedido #${folio}`)}`;
      const replyMarkupTelegram = {
        inline_keyboard: [
          [
            {
              text: '💬 Contactar al Cliente por WhatsApp',
              url: waUrlCliente
            }
          ]
        ]
      };

      const enviadoTelegram = await enviarNotificacionTelegram(mensajeHtmlTelegram, replyMarkupTelegram);

      // Si es transferencia y adjuntó comprobante, enviarlo de inmediato a Telegram con el mismo botón interactivo
      if (tieneComprobanteAdjunto) {
        const captionComprobante = `🧾 <b>Comprobante de Pago Adjunto</b>\nFolio: <code>#${folio}</code>\nCliente: <b>${nombreCliente.trim()}</b> (Tel: ${telLimpio})\nTotal: <b>$${total.toFixed(2)} MXN</b>`;
        await enviarFotoTelegram(comprobanteTransferencia.uri, captionComprobante, replyMarkupTelegram);
      }

      // 6. Crear objeto de Ticket Digital
      const ticketData = {
        folio: folio,
        fecha: fechaHoyFormateada,
        cliente: nombreCliente.trim(),
        telefono: telLimpio,
        hora: horaSeleccionada,
        notas: notaEfectiva,
        metodoPago: metodoPagoTexto,
        total: total,
        carrito: [...carrito],
        mensajeCompleto: mensajeResumen,
        enviadoTelegram: enviadoTelegram
      };

      setTicketActual(ticketData);
      setModalTicketVisible(true);

      // Limpiar formulario, carrito y comprobante
      setCarrito([]);
      setHoraSeleccionada(null);
      setNotasPedido('');
      setComprobanteTransferencia(null);
    } catch (error) {
      console.error(error);
      mostrarAviso('Error', 'Ocurrió un problema al reservar tu pedido. Por favor intenta de nuevo.', 'error');
    } finally {
      setEnviandoPedido(false);
    }
  };

  // --- FUNCIONES DE ADMINISTRACIÓN ---
  const handleLoginAdmin = async () => {
    if (!emailAdmin || !passwordAdmin) {
      mostrarAviso('Campos incompletos', 'Ingresa tu correo y contraseña de administrador.', 'error');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, emailAdmin, passwordAdmin);
      setModalLoginVisible(false);
      setEmailAdmin('');
      setPasswordAdmin('');
      mostrarAviso('Bienvenido', 'Has ingresado con éxito al Panel de Administración.', 'exito');
    } catch (error) {
      mostrarAviso('Acceso Denegado', 'El correo o la contraseña son incorrectos.', 'error');
    }
  };

  const handleLogoutAdmin = async () => {
    try {
      await signOut(auth);
      mostrarAviso('Sesión Cerrada', 'Has regresado al modo cliente.', 'info');
    } catch (error) {
      mostrarAviso('Error', 'No se pudo cerrar la sesión.', 'error');
    }
  };

  const toggleDisponibilidad = async (id, estadoActual) => {
    try {
      await updateDoc(doc(db, 'productos', id), {
        disponible: !estadoActual
      });
    } catch (error) {
      mostrarAviso('Error', 'No se pudo actualizar la disponibilidad del producto.', 'error');
    }
  };

  const handleEliminarProducto = async (id, nombre) => {
    try {
      await deleteDoc(doc(db, 'productos', id));
      mostrarAviso('Producto Eliminado', `"${nombre}" fue retirado del catálogo.`, 'info');
    } catch (error) {
      mostrarAviso('Error', 'No se pudo eliminar el producto.', 'error');
    }
  };

  const handleAbrirEditarPrecio = (prod) => {
    setProductoAEditar(prod);
    setNuevoPrecioInput(prod.precio?.toString() || '');
    setModalEditarPrecio(true);
  };

  const handleGuardarPrecio = async () => {
    const precioNum = parseFloat(nuevoPrecioInput);
    if (isNaN(precioNum) || precioNum <= 0) {
      mostrarAviso('Precio Inválido', 'Ingresa un precio mayor a 0.', 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'productos', productoAEditar.id), {
        precio: precioNum
      });
      setModalEditarPrecio(false);
      setProductoAEditar(null);
      mostrarAviso('Éxito', 'Precio actualizado correctamente.', 'exito');
    } catch (error) {
      mostrarAviso('Error', 'No se pudo actualizar el precio.', 'error');
    }
  };

  const handleAgregarProducto = async () => {
    if (!nombreNuevoProd.trim() || !precioNuevoProd) {
      mostrarAviso('Campos Requeridos', 'Ingresa el nombre y el precio del producto.', 'error');
      return;
    }
    try {
      await addDoc(collection(db, 'productos'), {
        nombre: nombreNuevoProd.trim(),
        precio: parseFloat(precioNuevoProd),
        unidad: unidadNuevoProd || 'Kg',
        categoria: categoriaNuevoProd || 'preparados',
        disponible: true
      });
      setNombreNuevoProd('');
      setPrecioNuevoProd('');
      setModalNuevoProducto(false);
      mostrarAviso('¡Producto Guardado!', 'El producto ya está disponible en el menú.', 'exito');
    } catch (error) {
      mostrarAviso('Error', 'No se pudo guardar el nuevo producto.', 'error');
    }
  };

  const handleAgregarMuestraPreparados = async () => {
    try {
      await addDoc(collection(db, 'productos'), {
        nombre: 'Ceviche de Atún Fresco',
        precio: 160,
        unidad: '1/2 Litro',
        categoria: 'preparados',
        disponible: true
      });
      mostrarAviso('¡Ceviche Agregado!', 'Se agregó "Ceviche de Atún Fresco" al menú.', 'exito');
    } catch (error) {
      mostrarAviso('Error', 'No se pudo agregar el producto.', 'error');
    }
  };

  const handleLiberarHorario = async (idHorario, horaTexto) => {
    try {
      await deleteDoc(doc(db, 'horarios_ocupados', idHorario));
      mostrarAviso('Horario Liberado', `El turno de las ${horaTexto} vuelve a estar libre.`, 'exito');
    } catch (error) {
      mostrarAviso('Error', 'No se pudo liberar el horario.', 'error');
    }
  };

  const handleLimpiarTodosLosHorariosHoy = async () => {
    try {
      const promesas = horariosOcupadosDocs.map((hor) =>
        deleteDoc(doc(db, 'horarios_ocupados', hor.id))
      );
      await Promise.all(promesas);
      mostrarAviso('Turnos Reiniciados', 'Todos los turnos de hoy han sido liberados.', 'exito');
    } catch (error) {
      mostrarAviso('Error', 'No se pudieron reiniciar los turnos.', 'error');
    }
  };

  const cambiarModoEstadoAdmin = async (nuevoModo) => {
    try {
      await setDoc(doc(db, 'configuracion', 'general'), {
        modoForzadoEstado: nuevoModo
      }, { merge: true });
      const nombresModo = {
        'auto': 'Modo Automático por Reloj Comercial',
        'abierto': 'Negocio Forzado a ABIERTO',
        'cerrado': 'Negocio Forzado a CERRADO'
      };
      mostrarAviso('Estado Actualizado', `Ahora el negocio está en: ${nombresModo[nuevoModo]}`, 'exito');
    } catch (error) {
      mostrarAviso('Error', 'No se pudo cambiar el estado del negocio.', 'error');
    }
  };

  const handleGuardarTelefono = async () => {
    if (!nuevoTelefonoInput.trim()) {
      mostrarAviso('Número Inválido', 'Ingresa el número de WhatsApp a 10 dígitos.', 'error');
      return;
    }
    try {
      await setDoc(doc(db, 'configuracion', 'general'), {
        telefono: nuevoTelefonoInput.trim()
      }, { merge: true });
      setModalEditarTelefono(false);
      mostrarAviso('Guardado', 'Número de WhatsApp actualizado.', 'exito');
    } catch (error) {
      mostrarAviso('Error', 'No se pudo actualizar el teléfono.', 'error');
    }
  };

  // Abrir modal de edición estructurada de datos bancarios
  const handleAbrirEditarBanco = () => {
    setInputBancoNombre(datosBancariosEstructurados.banco);
    setInputBancoTarjeta(datosBancariosEstructurados.tarjeta);
    setInputBancoClabe(datosBancariosEstructurados.clabe);
    setInputBancoTitular(datosBancariosEstructurados.titular);
    setModalEditarBanco(true);
  };

  const handleGuardarBanco = async () => {
    try {
      const nombreLimpio = inputBancoNombre.trim() || 'BBVA';
      const tarjetaLimpia = inputBancoTarjeta.trim();
      const clabeLimpia = inputBancoClabe.trim();
      const titularLimpio = inputBancoTitular.trim() || 'Pescadería Batequis';

      const textoFormateado = `Banco: ${nombreLimpio}\nTarjeta: ${tarjetaLimpia}\nCLABE: ${clabeLimpia}\nTitular: ${titularLimpio}`;

      await setDoc(doc(db, 'configuracion', 'general'), {
        bancoNombre: nombreLimpio,
        bancoTarjeta: tarjetaLimpia,
        bancoClabe: clabeLimpia,
        bancoTitular: titularLimpio,
        datosBancarios: textoFormateado
      }, { merge: true });

      setBancoNombre(nombreLimpio);
      setBancoTarjeta(tarjetaLimpia);
      setBancoClabe(clabeLimpia);
      setBancoTitular(titularLimpio);
      setDatosBancarios(textoFormateado);

      setModalEditarBanco(false);
      mostrarAviso('Guardado', 'Datos bancarios actualizados correctamente.', 'exito');
    } catch (error) {
      mostrarAviso('Error', 'No se pudo actualizar la información bancaria.', 'error');
    }
  };

  const handleGuardarUbicacion = async () => {
    if (!nuevaUbicacionInput.trim()) {
      mostrarAviso('Enlace Requerido', 'Ingresa el enlace de Google Maps.', 'error');
      return;
    }
    try {
      await setDoc(doc(db, 'configuracion', 'general'), {
        urlUbicacion: nuevaUbicacionInput.trim()
      }, { merge: true });
      setModalEditarUbicacion(false);
      mostrarAviso('Guardado', 'Ubicación en Google Maps actualizada.', 'exito');
    } catch (error) {
      mostrarAviso('Error', 'No se pudo actualizar la ubicación.', 'error');
    }
  };

  const handleGuardarHorarios = async () => {
    const ap = parseInt(nuevaAperturaInput);
    const ci = parseInt(nuevoCierreInput);
    if (isNaN(ap) || isNaN(ci) || ap < 0 || ci > 24 || ap >= ci) {
      mostrarAviso('Horas Inválidas', 'Ingresa horas en formato de 24 horas (ej. 9 para 9 AM, 17 para 5 PM).', 'error');
      return;
    }
    try {
      await setDoc(doc(db, 'configuracion', 'general'), {
        horaApertura: ap,
        horaCierre: ci
      }, { merge: true });
      setModalEditarHorarios(false);
      mostrarAviso('Guardado', 'Horario de atención actualizado.', 'exito');
    } catch (error) {
      mostrarAviso('Error', 'No se pudo actualizar el horario.', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0c4a6e" />

      {/* CONTENEDOR PRINCIPAL RESPONSIVE */}
      <View style={styles.appContainer}>
        {/* MARCA DE AGUA SUTIL DE FONDO (Logo Oficial Batequis) */}
        <View style={styles.watermarkBgContainer} pointerEvents="none">
          <Image
            source={LOGO_IMG}
            style={styles.watermarkBgImage}
            resizeMode="contain"
          />
        </View>

        {/* ENCABEZADO */}
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <View style={styles.headerLogoContainer}>
              <Image source={LOGO_IMG} style={styles.headerLogoImg} resizeMode="contain" />
            </View>
            <View>
              <Text style={styles.headerTitle}>Pescadería Batequis</Text>
              <Text style={styles.headerSubtitle}>Camarón • Pescado • Pulpo</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {isAdmin ? (
              <TouchableOpacity style={styles.btnHeaderAdminOut} onPress={handleLogoutAdmin}>
                <Text style={styles.btnHeaderAdminText}>Cerrar Admin</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.btnHeaderAdmin} onPress={() => setModalLoginVisible(true)}>
                <Text style={styles.btnHeaderAdminText}>Admin 🔒</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView style={styles.mainScroll} contentContainerStyle={{ paddingBottom: 50 }}>
          {/* BANNER DE ESTADO DEL NEGOCIO Y UBICACIÓN */}
          <View style={styles.statusBannerCard}>
            <View style={styles.statusPillWrapper}>
              <View style={[styles.statusDotLive, { backgroundColor: estaAbierto ? '#10b981' : '#ef4444' }]} />
              <View>
                <Text style={styles.statusStateTitle}>
                  {estaAbierto ? 'NEGOCIO ABIERTO' : 'ACTUALMENTE CERRADO'}
                </Text>
                <Text style={styles.statusStateHours}>
                  {estaAbierto
                    ? `Atención de ${horaApertura}:00 hrs a ${horaCierre}:00 hrs`
                    : `Reanudamos servicio a las ${horaApertura}:00 hrs`}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.btnMapsBanner} onPress={() => Linking.openURL(urlUbicacion)}>
              <Text style={styles.btnMapsBannerText}>📍 Ver Maps</Text>
            </TouchableOpacity>
          </View>

          {/* PANEL DE CONTROL DEL ADMINISTRADOR */}
          {isAdmin && (
            <View style={styles.adminDashboardCard}>
              <View style={styles.adminDashboardHeader}>
                <Text style={styles.adminDashboardTitle}>⚙️ PANEL ADMINISTRADOR</Text>
                <Text style={styles.adminDashboardBadge}>Sesión Activa</Text>
              </View>

              {/* TABS DE ADMIN */}
              <View style={styles.adminTabsRow}>
                <TouchableOpacity
                  style={[styles.adminTabBtn, adminTab === 'catalogo' && styles.adminTabBtnActive]}
                  onPress={() => setAdminTab('catalogo')}
                >
                  <Text style={[styles.adminTabBtnText, adminTab === 'catalogo' && styles.adminTabBtnTextActive]}>
                    📦 Menú ({productos.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.adminTabBtn, adminTab === 'horarios' && styles.adminTabBtnActive]}
                  onPress={() => setAdminTab('horarios')}
                >
                  <Text style={[styles.adminTabBtnText, adminTab === 'horarios' && styles.adminTabBtnTextActive]}>
                    ⏰ Turnos Hoy ({horariosOcupadosDocs.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.adminTabBtn, adminTab === 'config' && styles.adminTabBtnActive]}
                  onPress={() => setAdminTab('config')}
                >
                  <Text style={[styles.adminTabBtnText, adminTab === 'config' && styles.adminTabBtnTextActive]}>
                    🛠️ Ajustes
                  </Text>
                </TouchableOpacity>
              </View>

              {/* TAB 1: GESTIÓN DE PRODUCTOS */}
              {adminTab === 'catalogo' && (
                <View style={styles.adminTabContent}>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                    <TouchableOpacity
                      style={[styles.btnAdminPrimaryAction, { flex: 1, marginBottom: 0 }]}
                      onPress={() => setModalNuevoProducto(true)}
                    >
                      <Text style={styles.btnAdminPrimaryActionText}>➕ Agregar Producto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.btnAdminSampleAction}
                      onPress={handleAgregarMuestraPreparados}
                    >
                      <Text style={styles.btnAdminSampleActionText}>🥗 + Ceviche Atún</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.adminTipText}>
                    💡 Puedes alternar rápidamente si un producto está agotado o disponible, editar su precio o retirarlo.
                  </Text>
                </View>
              )}

              {/* TAB 2: GESTIÓN DE HORARIOS RESERVADOS DE HOY */}
              {adminTab === 'horarios' && (
                <View style={styles.adminTabContent}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={styles.adminSubSectionTitle}>
                      Turnos Reservados de Hoy ({horariosOcupadosDocs.length}):
                    </Text>
                    {horariosOcupadosDocs.length > 0 && (
                      <TouchableOpacity
                        style={styles.btnLimpiarTodoTurnos}
                        onPress={handleLimpiarTodosLosHorariosHoy}
                      >
                        <Text style={styles.btnLimpiarTodoTurnosText}>🧹 Resetear Todos</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.adminHorariosSubNote}>
                    ✨ Todos los turnos se liberan automáticamente cada nuevo día sin intervención.
                  </Text>

                  {horariosOcupadosDocs.length === 0 ? (
                    <Text style={styles.emptyNoticeText}>No hay turnos ocupados para el día de hoy.</Text>
                  ) : (
                    horariosOcupadosDocs.map((hor) => (
                      <View key={hor.id} style={styles.horarioRowAdmin}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.horarioHoraText}>{hor.hora}</Text>
                          <Text style={styles.horarioClienteText}>
                            Cliente: {hor.cliente || 'Sin nombre'} {hor.telefono ? `(${hor.telefono})` : ''}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.btnLiberarTurno}
                          onPress={() => handleLiberarHorario(hor.id, hor.hora)}
                        >
                          <Text style={styles.btnLiberarTurnoText}>Liberar</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* TAB 3: CONFIGURACIÓN GENERAL */}
              {adminTab === 'config' && (
                <View style={styles.adminTabContent}>
                  <Text style={styles.adminSubSectionTitle}>Estado Forzado del Negocio:</Text>
                  <View style={styles.adminStateToggleRow}>
                    <TouchableOpacity
                      style={[styles.btnStateToggle, modoForzadoEstado === 'abierto' && styles.btnStateActiveOpen]}
                      onPress={() => cambiarModoEstadoAdmin('abierto')}
                    >
                      <Text style={[styles.btnStateToggleText, modoForzadoEstado === 'abierto' && styles.textWhite]}>
                        🟢 Abierto
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnStateToggle, modoForzadoEstado === 'auto' && styles.btnStateActiveAuto]}
                      onPress={() => cambiarModoEstadoAdmin('auto')}
                    >
                      <Text style={[styles.btnStateToggleText, modoForzadoEstado === 'auto' && styles.textWhite]}>
                        🕒 Automático
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnStateToggle, modoForzadoEstado === 'cerrado' && styles.btnStateActiveClosed]}
                      onPress={() => cambiarModoEstadoAdmin('cerrado')}
                    >
                      <Text style={[styles.btnStateToggleText, modoForzadoEstado === 'cerrado' && styles.textWhite]}>
                        🛑 Cerrado
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.adminConfigActionsGrid}>
                    <TouchableOpacity
                      style={styles.btnConfigItem}
                      onPress={() => {
                        setNuevoTelefonoInput(telefonoContacto);
                        setModalEditarTelefono(true);
                      }}
                    >
                      <Text style={styles.btnConfigItemTitle}>📞 WhatsApp de Recepción</Text>
                      <Text style={styles.btnConfigItemValue}>{telefonoContacto}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnConfigItem}
                      onPress={() => {
                        setNuevaAperturaInput(horaApertura.toString());
                        setNuevoCierreInput(horaCierre.toString());
                        setModalEditarHorarios(true);
                      }}
                    >
                      <Text style={styles.btnConfigItemTitle}>⏰ Horario de Atención</Text>
                      <Text style={styles.btnConfigItemValue}>{horaApertura}:00 hrs a {horaCierre}:00 hrs</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnConfigItem}
                      onPress={handleAbrirEditarBanco}
                    >
                      <Text style={styles.btnConfigItemTitle}>💳 Datos para Transferencia (Tarjeta, CLABE, Titular)</Text>
                      <Text style={styles.btnConfigItemValue} numberOfLines={1}>
                        {datosBancariosEstructurados.banco} • {datosBancariosEstructurados.titular}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnConfigItem}
                      onPress={() => {
                        setNuevaUbicacionInput(urlUbicacion);
                        setModalEditarUbicacion(true);
                      }}
                    >
                      <Text style={styles.btnConfigItemTitle}>📍 Enlace de Google Maps</Text>
                      <Text style={styles.btnConfigItemValue} numberOfLines={1}>{urlUbicacion}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* HISTORIAL Y REPETIR PEDIDO RECIENTE */}
          {historialPedidos.length > 0 && (
            <View style={styles.recentOrderCard}>
              <View style={styles.recentOrderHeader}>
                <Text style={styles.recentOrderTitle}>🔁 Tu Último Pedido</Text>
                <Text style={styles.recentOrderDate}>{historialPedidos[0].fecha}</Text>
              </View>
              <Text style={styles.recentOrderSummary}>
                Total: ${historialPedidos[0].total ? historialPedidos[0].total.toFixed(2) : '0.00'} MXN
                {historialPedidos[0].hora ? ` • Recolección: ${historialPedidos[0].hora}` : ''}
              </Text>
              <TouchableOpacity
                style={styles.btnRepeatOrder}
                onPress={() => handleRepetirPedido(historialPedidos[0])}
              >
                <Text style={styles.btnRepeatOrderText}>Cargar Productos al Carrito 🛒</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* SECCIÓN 1: DATOS DE CONTACTO */}
          <View style={styles.contentCard}>
            <View style={styles.cardHeaderWithIcon}>
              <Text style={styles.cardHeaderIcon}>👤</Text>
              <View>
                <Text style={styles.cardTitle}>Datos de Quien Recoge</Text>
                <Text style={styles.cardSub}>Para identificar tu pedido al llegar a sucursal</Text>
              </View>
            </View>
            <View style={styles.formGroup}>
              <View style={styles.inputLabelRow}>
                <Text style={styles.inputLabel}>Nombre Completo *</Text>
                {nombreCliente.trim().length > 0 && (
                  <Text style={styles.inputHelperSaved}>✓ Guardado en tu dispositivo</Text>
                )}
              </View>
              <TextInput
                style={styles.textInputModern}
                placeholder="Ej. Juan Pérez"
                placeholderTextColor="#94a3b8"
                value={nombreCliente}
                onChangeText={handleCambioNombreCliente}
              />
            </View>

            <View style={[styles.formGroup, { marginBottom: 0 }]}>
              <View style={styles.inputLabelRow}>
                <Text style={styles.inputLabel}>Teléfono / WhatsApp *</Text>
                {telefonoCliente.trim().length > 0 && (
                  <Text style={styles.inputHelperSaved}>✓ Guardado en tu dispositivo</Text>
                )}
              </View>
              <TextInput
                style={styles.textInputModern}
                placeholder="Ej. 6871234567 (10 dígitos)"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                maxLength={10}
                value={telefonoCliente}
                onChangeText={handleCambioTelefonoCliente}
              />
            </View>
          </View>

          {/* SECCIÓN 2: CATÁLOGO DE PRODUCTOS CON BUSCADOR */}
          <View style={styles.contentCard}>
            <View style={styles.cardHeaderWithIcon}>
              <Text style={styles.cardHeaderIcon}>🐟</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Menú y Mariscos de Hoy</Text>
                <Text style={styles.cardSub}>Selecciona la cantidad en kilos, gramos o pesos</Text>
              </View>
            </View>

            {/* BUSCADOR Y FILTROS RÁPIDOS */}
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="🔍 Buscar camarón, filete, curvina..."
                placeholderTextColor="#94a3b8"
                value={busquedaProducto}
                onChangeText={setBusquedaProducto}
              />
              {busquedaProducto !== '' && (
                <TouchableOpacity style={styles.btnClearSearch} onPress={() => setBusquedaProducto('')}>
                  <Text style={styles.btnClearSearchText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* CATEGORÍAS PRINCIPALES DEL MENÚ */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScrollContainer}
              style={styles.categoryScrollView}
            >
              {[
                { id: 'todas', label: '🌟 Todos' },
                { id: 'preparados', label: '🥗 Preparados & Ceviches' },
                { id: 'camaron', label: '🦐 Camarón' },
                { id: 'pescado', label: '🐟 Pescados & Filetes' },
                { id: 'pulpo', label: '🐙 Pulpo & Mariscos' },
                { id: 'complementos', label: '🍋 Complementos' },
              ].map((cat) => {
                const activo = categoriaFiltro === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.categoryPill, activo && styles.categoryPillActive]}
                    onPress={() => setCategoriaFiltro(cat.id)}
                  >
                    <Text style={[styles.categoryPillText, activo && styles.categoryPillTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.filtersRow}>
              <TouchableOpacity
                style={[styles.filterChip, filtroDisponibilidad === 'todos' && styles.filterChipActive]}
                onPress={() => setFiltroDisponibilidad('todos')}
              >
                <Text style={[styles.filterChipText, filtroDisponibilidad === 'todos' && styles.filterChipTextActive]}>
                  Todos ({productos.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, filtroDisponibilidad === 'disponibles' && styles.filterChipActive]}
                onPress={() => setFiltroDisponibilidad('disponibles')}
              >
                <Text style={[styles.filterChipText, filtroDisponibilidad === 'disponibles' && styles.filterChipTextActive]}>
                  ✓ Solo Disponibles
                </Text>
              </TouchableOpacity>
            </View>

            {/* LISTADO DE PRODUCTOS */}
            {productosFiltrados.length === 0 ? (
              <View style={styles.emptyStateBox}>
                <Text style={styles.emptyStateEmoji}>🌊</Text>
                <Text style={styles.emptyStateTitle}>No se encontraron productos</Text>
                <Text style={styles.emptyStateSub}>Prueba con otro término de búsqueda o selecciona otra categoría.</Text>
              </View>
            ) : (
              productosFiltrados.map((prod) => (
                <View key={prod.id} style={styles.productCardItem}>
                  <View style={styles.productInfoCol}>
                    <View style={styles.productBadgeRow}>
                      {(() => {
                        const badge = obtenerBadgeCategoria(prod);
                        return (
                          <Text style={[styles.productBadgeText, { backgroundColor: badge.bg, color: badge.color, borderColor: badge.border }]}>
                            {badge.label}
                          </Text>
                        );
                      })()}
                    </View>
                    <Text style={styles.productTitle}>{prod.nombre}</Text>
                    <View style={styles.productPriceRow}>
                      <Text style={styles.productPriceAmount}>${prod.precio} MXN</Text>
                      <Text style={styles.productPriceUnit}>/ {prod.unidad || 'Kg'}</Text>
                    </View>
                  </View>

                  <View style={styles.productActionCol}>
                    {prod.disponible ? (
                      <TouchableOpacity
                        style={styles.btnAddProductBtn}
                        onPress={() => abrirModalSeleccion(prod)}
                      >
                        <Text style={styles.btnAddProductBtnText}>+ Agregar</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.badgeAgotadoPill}>
                        <Text style={styles.badgeAgotadoText}>AGOTADO</Text>
                      </View>
                    )}

                    {/* CONTROLES DE ADMIN POR PRODUCTO */}
                    {isAdmin && (
                      <View style={styles.productAdminToolsRow}>
                        <TouchableOpacity
                          style={[
                            styles.btnAdminTool,
                            { backgroundColor: prod.disponible ? '#fef2f2' : '#f0fdf4' }
                          ]}
                          onPress={() => toggleDisponibilidad(prod.id, prod.disponible)}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: prod.disponible ? '#dc2626' : '#16a34a' }}>
                            {prod.disponible ? 'Agotar' : 'Activar'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.btnAdminTool, { backgroundColor: '#f0f9ff' }]}
                          onPress={() => handleAbrirEditarPrecio(prod)}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#0284c7' }}>
                            $ Edit
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.btnAdminTool, { backgroundColor: '#fef2f2' }]}
                          onPress={() => handleEliminarProducto(prod.id, prod.nombre)}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>
                            🗑️
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>

          {/* SECCIÓN 3: DETALLE DEL CARRITO */}
          {carrito.length > 0 && (
            <View style={styles.contentCard}>
              <View style={styles.cardHeaderWithIcon}>
                <Text style={styles.cardHeaderIcon}>🛒</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Tu Pedido ({carrito.length} artículos)</Text>
                  <Text style={styles.cardSub}>Verifica las cantidades antes de confirmar</Text>
                </View>
              </View>

              <View style={styles.cartItemsList}>
                {carrito.map((item) => (
                  <View key={item.idCarrito} style={styles.cartItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartItemTitle}>{item.nombre}</Text>
                      <Text style={styles.cartItemDetail}>
                        {item.unidad === 'Pesos' ? `$${item.cantidad} MXN` : `${item.cantidad} ${item.unidad}`}
                        {'  ➔  '}
                        <Text style={styles.cartItemSubtotal}>${item.subtotal.toFixed(2)} MXN</Text>
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.btnRemoveCartItem}
                      onPress={() => handleEliminarDelCarrito(item.idCarrito)}
                    >
                      <Text style={styles.btnRemoveCartItemText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              <View style={styles.cartTotalHighlightBox}>
                <View>
                  <Text style={styles.cartTotalLabel}>Total a Pagar Estimado</Text>
                  <Text style={styles.cartTotalSub}>Sujeto al peso exacto en mostrador</Text>
                </View>
                <Text style={styles.cartTotalNumber}>
                  ${calcularTotalCarrito().toFixed(2)} MXN
                </Text>
              </View>
            </View>
          )}

          {/* SECCIÓN 4: FORMA DE PAGO CON COPIADO INDIVIDUAL DE DATOS BANCARIOS */}
          <View style={styles.contentCard}>
            <View style={styles.cardHeaderWithIcon}>
              <Text style={styles.cardHeaderIcon}>💳</Text>
              <View>
                <Text style={styles.cardTitle}>Forma de Pago</Text>
                <Text style={styles.cardSub}>Elige cómo deseas liquidar tu pedido</Text>
              </View>
            </View>

            <View style={styles.paymentMethodsRow}>
              <TouchableOpacity
                style={[styles.paymentMethodCard, metodoPago === 'efectivo' && styles.paymentMethodCardActive]}
                onPress={() => setMetodoPago('efectivo')}
              >
                <Text style={styles.paymentMethodEmoji}>💵</Text>
                <Text style={[styles.paymentMethodTitle, metodoPago === 'efectivo' && styles.paymentMethodTitleActive]}>
                  Efectivo
                </Text>
                <Text style={styles.paymentMethodDesc}>Pagas al recoger</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.paymentMethodCard, metodoPago === 'transferencia' && styles.paymentMethodCardActive]}
                onPress={() => setMetodoPago('transferencia')}
              >
                <Text style={styles.paymentMethodEmoji}>📱</Text>
                <Text style={[styles.paymentMethodTitle, metodoPago === 'transferencia' && styles.paymentMethodTitleActive]}>
                  Transferencia
                </Text>
                <Text style={styles.paymentMethodDesc}>Copia los datos abajo</Text>
              </TouchableOpacity>
            </View>

            {metodoPago === 'transferencia' && (
              <View style={styles.bankCardStructured}>
                <Text style={styles.bankCardStructuredHeading}>
                  🏦 Datos para Transferencia Bancaria
                </Text>
                <Text style={styles.bankCardStructuredSub}>
                  Toca "Copiar" en el dato específico que necesites:
                </Text>

                {/* CAMPO 1: BANCO */}
                {Boolean(datosBancariosEstructurados.banco) && (
                  <View style={styles.bankFieldRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bankFieldLabel}>BANCO DESTINO</Text>
                      <Text style={styles.bankFieldValue}>{datosBancariosEstructurados.banco}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.btnCopySingle, campoCopiado === 'banco' && styles.btnCopySingleActive]}
                      onPress={() => copiarAlPortapapeles(datosBancariosEstructurados.banco, 'Banco copiado', 'banco')}
                    >
                      <Text style={[styles.btnCopySingleText, campoCopiado === 'banco' && styles.btnCopySingleTextActive]}>
                        {campoCopiado === 'banco' ? '✓ Copiado' : '📋 Copiar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* CAMPO 2: NÚMERO DE TARJETA */}
                {Boolean(datosBancariosEstructurados.tarjeta) && (
                  <View style={styles.bankFieldRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bankFieldLabel}>NÚMERO DE TARJETA</Text>
                      <Text style={styles.bankFieldDigits}>{datosBancariosEstructurados.tarjeta}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.btnCopySingle, campoCopiado === 'tarjeta' && styles.btnCopySingleActive]}
                      onPress={() =>
                        copiarAlPortapapeles(
                          datosBancariosEstructurados.tarjeta.replace(/\s+/g, ''),
                          'Número de tarjeta copiado',
                          'tarjeta'
                        )
                      }
                    >
                      <Text style={[styles.btnCopySingleText, campoCopiado === 'tarjeta' && styles.btnCopySingleTextActive]}>
                        {campoCopiado === 'tarjeta' ? '✓ Copiado' : '📋 Copiar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* CAMPO 3: CLABE INTERBANCARIA */}
                {Boolean(datosBancariosEstructurados.clabe) && (
                  <View style={styles.bankFieldRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bankFieldLabel}>CLABE INTERBANCARIA (SPEI)</Text>
                      <Text style={styles.bankFieldDigits}>{datosBancariosEstructurados.clabe}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.btnCopySingle, campoCopiado === 'clabe' && styles.btnCopySingleActive]}
                      onPress={() =>
                        copiarAlPortapapeles(
                          datosBancariosEstructurados.clabe.replace(/\s+/g, ''),
                          'CLABE copiada',
                          'clabe'
                        )
                      }
                    >
                      <Text style={[styles.btnCopySingleText, campoCopiado === 'clabe' && styles.btnCopySingleTextActive]}>
                        {campoCopiado === 'clabe' ? '✓ Copiado' : '📋 Copiar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* CAMPO 4: TITULAR */}
                {Boolean(datosBancariosEstructurados.titular) && (
                  <View style={styles.bankFieldRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bankFieldLabel}>TITULAR DE LA CUENTA</Text>
                      <Text style={styles.bankFieldValue}>{datosBancariosEstructurados.titular}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.btnCopySingle, campoCopiado === 'titular' && styles.btnCopySingleActive]}
                      onPress={() =>
                        copiarAlPortapapeles(datosBancariosEstructurados.titular, 'Titular copiado', 'titular')
                      }
                    >
                      <Text style={[styles.btnCopySingleText, campoCopiado === 'titular' && styles.btnCopySingleTextActive]}>
                        {campoCopiado === 'titular' ? '✓ Copiado' : '📋 Copiar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* BOTÓN EXTRA: COPIAR TODOS LOS DATOS JUNTOS */}
                <TouchableOpacity
                  style={[styles.btnCopyAllBank, campoCopiado === 'todo' && styles.btnCopySingleActive]}
                  onPress={() =>
                    copiarAlPortapapeles(
                      `Banco: ${datosBancariosEstructurados.banco}\nTarjeta: ${datosBancariosEstructurados.tarjeta}\nCLABE: ${datosBancariosEstructurados.clabe}\nTitular: ${datosBancariosEstructurados.titular}`,
                      'Resumen bancario completo copiado',
                      'todo'
                    )
                  }
                >
                  <Text style={[styles.btnCopyAllBankText, campoCopiado === 'todo' && styles.btnCopySingleTextActive]}>
                    {campoCopiado === 'todo' ? '✓ ¡Todos los Datos Copiados!' : '📑 Copiar Resumen Completo'}
                  </Text>
                </TouchableOpacity>

                {/* ADJUNTAR COMPROBANTE DE PAGO */}
                <View style={[styles.receiptUploadBox, comprobanteTransferencia && styles.receiptUploadBoxActive]}>
                  {comprobanteTransferencia ? (
                    <View style={styles.receiptPreviewContainer}>
                      <Image
                        source={{ uri: comprobanteTransferencia.uri }}
                        style={styles.receiptPreviewImage}
                        resizeMode="cover"
                      />
                      <Text style={styles.receiptUploadTitle}>✓ Comprobante de Pago Adjuntado</Text>
                      <Text style={styles.receiptUploadSub}>Se enviará automáticamente a Telegram junto con tu pedido</Text>
                      <View style={styles.receiptPreviewActions}>
                        <TouchableOpacity
                          style={styles.btnChangeReceipt}
                          onPress={handleSeleccionarComprobante}
                        >
                          <Text style={styles.btnChangeReceiptText}>🔄 Cambiar Foto</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.btnRemoveReceipt}
                          onPress={handleEliminarComprobante}
                        >
                          <Text style={styles.btnRemoveReceiptText}>✕ Quitar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.receiptUploadIcon}>📸</Text>
                      <Text style={styles.receiptUploadTitle}>Adjuntar Comprobante de Transferencia</Text>
                      <Text style={styles.receiptUploadSub}>
                        Sube una captura o foto de tu comprobante y se enviará directo a nuestro Telegram
                      </Text>
                      <TouchableOpacity
                        style={styles.btnUploadReceipt}
                        onPress={handleSeleccionarComprobante}
                      >
                        <Text style={styles.btnUploadReceiptText}>📎 Seleccionar Imagen</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* SECCIÓN 4.5: NOTAS DE PREPARACIÓN (SOLO SI ELIGE PREPARADOS O CEVICHES) */}
          {tienePreparadosEnCarrito && (
            <View style={styles.contentCard}>
              <View style={styles.cardHeaderWithIcon}>
                <Text style={styles.cardHeaderIcon}>📝</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Notas de Preparación (Opcional)</Text>
                  <Text style={styles.cardSub}>Indicaciones para tus ceviches o preparados</Text>
                </View>
              </View>

              <TextInput
                style={[styles.textInputModern, { marginTop: 10, minHeight: 70, textAlignVertical: 'top' }]}
                placeholder="Escribe aquí tus indicaciones (ej. Poco picante, sin cebolla, salsa y tostadas aparte...)"
                placeholderTextColor="#94a3b8"
                multiline={true}
                numberOfLines={3}
                value={notasPedido}
                onChangeText={setNotasPedido}
              />
            </View>
          )}

          {/* SECCIÓN 5: HORA DE RECOLECCIÓN (DINÁMICA) */}
          <View style={styles.contentCard}>
            <View style={styles.cardHeaderWithIcon}>
              <Text style={styles.cardHeaderIcon}>⏰</Text>
              <View>
                <Text style={styles.cardTitle}>Hora de Recolección</Text>
                <Text style={styles.cardSub}>Apartamos tu turno para que tu producto esté listo</Text>
              </View>
            </View>

            {/* AVISO DE TIEMPO DE PREPARACIÓN DE 30 MINUTOS SI HAY CEVICHES */}
            {tienePreparadosEnCarrito && (
              <View style={styles.prepTimeNoticeBox}>
                <Text style={styles.prepTimeNoticeIcon}>⏱️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prepTimeNoticeTitle}>Tiempo de Cocina Requerido (Mínimo 30 min)</Text>
                  <Text style={styles.prepTimeNoticeDesc}>
                    Al incluir ceviches o platillos preparados, los turnos comienzan a partir de 30 minutos en adelante para asegurar su frescura y preparación al momento.
                  </Text>
                </View>
              </View>
            )}

            {Boolean(turnoMasProximo) && (
              <TouchableOpacity
                style={[
                  styles.btnQuickPickup,
                  horaSeleccionada === turnoMasProximo && styles.btnQuickPickupActive
                ]}
                onPress={() => setHoraSeleccionada(turnoMasProximo)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.btnQuickPickupIcon}>⚡</Text>
                  <View>
                    <Text style={[styles.btnQuickPickupTitle, horaSeleccionada === turnoMasProximo && styles.btnQuickPickupTitleActive]}>
                      Pasar lo antes posible
                    </Text>
                    <Text style={styles.btnQuickPickupSub}>
                      Turno más próximo estimado: {turnoMasProximo}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.btnQuickPickupSelectBadge, horaSeleccionada === turnoMasProximo && styles.btnQuickPickupSelectBadgeActive]}>
                  {horaSeleccionada === turnoMasProximo ? '✓ Elegido' : 'Seleccionar'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.timeSelectorTrigger, horaSeleccionada && styles.timeSelectorTriggerActive]}
              onPress={abrirModalHora}
            >
              <View style={styles.timeSelectorTriggerLeft}>
                <Text style={styles.timeSelectorEmoji}>🕒</Text>
                <Text style={[styles.timeSelectorText, horaSeleccionada && styles.timeSelectorTextActive]}>
                  {horaSeleccionada
                    ? `Hora Elegida: ${horaSeleccionada}`
                    : horasDisponiblesHoy.length > 0
                      ? 'Toca para elegir tu hora (Intervalos de 5 min)'
                      : 'Sin turnos disponibles por hoy'}
                </Text>
              </View>
              <Text style={styles.timeSelectorArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* BOTÓN PRINCIPAL DE CONFIRMACIÓN */}
          <TouchableOpacity
            style={[
              styles.btnMainOrderSubmit,
              ((!estaAbierto && !isAdmin) || enviandoPedido) && styles.btnMainOrderSubmitDisabled
            ]}
            disabled={(!estaAbierto && !isAdmin) || enviandoPedido}
            onPress={handleConfirmarPedido}
          >
            <Text style={styles.btnMainOrderSubmitText}>
              {enviandoPedido
                ? 'Enviando Pedido a Sucursal... ⏳'
                : estaAbierto
                  ? 'Confirmar y Enviar Pedido a Sucursal 🚀'
                  : 'Sucursal Cerrada por el Momento 🛑'}
            </Text>
            <Text style={styles.btnMainOrderSubmitSubtext}>
              {enviandoPedido
                ? 'Conectando con la recepción en Telegram...'
                : estaAbierto
                  ? 'Se enviará directo a nuestra cocina para preparar tu turno'
                  : 'Consulta nuestros horarios de atención'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* =========================================================================
          MODAL 1: TICKET DIGITAL Y CONFIRMACIÓN DE PEDIDO
         ========================================================================= */}
      <Modal visible={modalTicketVisible} animationType="slide" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.ticketModalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* TICKET DIGITAL CON DISEÑO FORMAL DE COMPROBANTE */}
              <View style={styles.digitalTicketReceipt}>
                {/* MARCA DE AGUA INTERNA EN TICKET */}
                <View style={styles.ticketWatermarkContainer} pointerEvents="none">
                  <Image source={LOGO_IMG} style={styles.ticketWatermarkImage} resizeMode="contain" />
                </View>
                <View style={styles.ticketTopHeader}>
                  <Image source={LOGO_IMG} style={styles.ticketLogoImg} resizeMode="contain" />
                  <Text style={styles.ticketStoreName}>PESCADERÍA BATEQUIS</Text>
                  <Text style={styles.ticketSubStore}>CAMARÓN • PESCADO • PULPO</Text>
                  <View style={styles.ticketFolioBadge}>
                    <Text style={styles.ticketFolioText}>FOLIO: #{ticketActual?.folio}</Text>
                  </View>
                </View>

                <View style={styles.ticketDividerDashed} />

                {/* DETALLES DE CITA Y CLIENTE */}
                <View style={styles.ticketDataRow}>
                  <Text style={styles.ticketDataLabel}>Cliente:</Text>
                  <Text style={styles.ticketDataValue}>{ticketActual?.cliente}</Text>
                </View>
                <View style={styles.ticketDataRow}>
                  <Text style={styles.ticketDataLabel}>Fecha:</Text>
                  <Text style={styles.ticketDataValue}>{ticketActual?.fecha}</Text>
                </View>
                <View style={styles.ticketDataRowHighlight}>
                  <Text style={styles.ticketDataLabelHighlight}>Hora de Entrega:</Text>
                  <Text style={styles.ticketDataValueHighlight}>⏰ {ticketActual?.hora}</Text>
                </View>
                <View style={styles.ticketDataRow}>
                  <Text style={styles.ticketDataLabel}>Pago:</Text>
                  <Text style={styles.ticketDataValue}>{ticketActual?.metodoPago}</Text>
                </View>

                <View style={styles.ticketDividerDashed} />

                {/* LISTA DE PRODUCTOS */}
                <Text style={styles.ticketProductsHeader}>PRODUCTOS SELECCIONADOS:</Text>
                {ticketActual?.carrito.map((item, idx) => (
                  <View key={idx} style={styles.ticketItemRow}>
                    <Text style={styles.ticketItemName} numberOfLines={1}>
                      • {item.nombre} ({item.unidad === 'Pesos' ? `$${item.cantidad} MXN` : `${item.cantidad} ${item.unidad}`})
                    </Text>
                    <Text style={styles.ticketItemPrice}>
                      ${item.subtotal.toFixed(2)}
                    </Text>
                  </View>
                ))}

                <View style={styles.ticketDividerSolid} />

                {/* TOTAL */}
                <View style={styles.ticketTotalRow}>
                  <Text style={styles.ticketTotalLabel}>TOTAL A PAGAR:</Text>
                  <Text style={styles.ticketTotalAmount}>
                    ${ticketActual?.total.toFixed(2)} MXN
                  </Text>
                </View>

                <Text style={styles.ticketFootnote}>
                  ¡Gracias por tu preferencia! Tu pedido ha sido enviado y registrado con éxito en sucursal.
                </Text>
              </View>

              {/* BOTONES DE ACCIÓN */}
              <View style={styles.ticketActionsContainer}>
                {ticketActual?.enviadoTelegram ? (
                  <View style={styles.ticketSuccessNotice}>
                    <Text style={styles.ticketSuccessNoticeIcon}>✅</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ticketSuccessNoticeTitle}>¡Pedido Enviado a la Empresa!</Text>
                      <Text style={styles.ticketSuccessNoticeDesc}>
                        Tu pedido llegó directamente al equipo de recepción en Telegram con el Folio #{ticketActual?.folio}. Te esperamos a las {ticketActual?.hora}.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.ticketSuccessNotice, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}>
                    <Text style={styles.ticketSuccessNoticeIcon}>📋</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.ticketSuccessNoticeTitle, { color: '#c2410c' }]}>Ticket Registrado</Text>
                      <Text style={[styles.ticketSuccessNoticeDesc, { color: '#9a3412' }]}>
                        Tu folio es #{ticketActual?.folio}. Muestra este ticket digital al recoger tu pedido.
                      </Text>
                    </View>
                  </View>
                )}

                {/* BOTÓN DIRECTO DE WHATSAPP CON LA SUCURSAL PARA DUDAS O CANCELACIÓN */}
                <TouchableOpacity
                  style={styles.btnTicketWhatsAppHelp}
                  onPress={() => {
                    const telSucursal = telefonoContacto || '6871689334';
                    const telSucursalLimpio = telSucursal.replace(/\D/g, '');
                    const msg = `Hola Pescadería Batequis, soy ${ticketActual?.cliente}. Me comunico sobre mi pedido #${ticketActual?.folio} programado a las ${ticketActual?.hora} (Total: $${ticketActual?.total ? ticketActual.total.toFixed(2) : '0.00'} MXN).`;
                    const url = `https://wa.me/52${telSucursalLimpio}?text=${encodeURIComponent(msg)}`;
                    Linking.openURL(url).catch(() => {
                      mostrarAviso('Contacto Sucursal', `Comunícate directamente al WhatsApp: ${telSucursal}`, 'info');
                    });
                  }}
                >
                  <Text style={styles.btnTicketWhatsAppHelpIcon}>💬</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.btnTicketWhatsAppHelpTitle}>¿Dudas, Cambios o Cancelar Pedido?</Text>
                    <Text style={styles.btnTicketWhatsAppHelpSub}>Toca aquí para escribir a Sucursal por WhatsApp</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnCloseTicketModalPrimary}
                  onPress={() => setModalTicketVisible(false)}
                >
                  <Text style={styles.btnCloseTicketModalPrimaryText}>✓ Finalizar y Volver al Menú</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnActionCopyDetails}
                  onPress={() => copiarAlPortapapeles(ticketActual?.mensajeCompleto, 'Resumen del pedido copiado')}
                >
                  <Text style={styles.btnActionCopyDetailsText}>
                    📋 {copiadoFeedback ? '¡Copiado con Éxito!' : 'Copiar Folio y Resumen'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL 2: SELECTOR DE HORA DINÁMICO (FILTRADO DE HORAS Y MINUTOS PASADOS)
         ========================================================================= */}
      <Modal visible={modalHoraVisible} animationType="slide" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.timePickerModalContent}>
            <View style={styles.modalHeaderCloseRow}>
              <Text style={styles.modalDialogTitle}>Selecciona tu Hora de Recolección</Text>
              <TouchableOpacity onPress={() => setModalHoraVisible(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDialogSub}>Turnos disponibles en tiempo real (Intervalos de 5 min)</Text>

            {horasDisponiblesHoy.length === 0 ? (
              <View style={styles.noHoursBox}>
                <Text style={styles.noHoursEmoji}>⏰</Text>
                <Text style={styles.noHoursTitle}>No hay turnos disponibles por hoy</Text>
                <Text style={styles.noHoursSub}>
                  Los horarios de recolección para el día de hoy ya concluyeron. Nuestro horario de atención es de {horaApertura}:00 a {horaCierre}:00 hrs.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.timePickerScrollableBody}
                contentContainerStyle={styles.timePickerScrollableBodyContent}
                showsVerticalScrollIndicator={false}
              >
                {/* 1. SELECCIÓN DE HORA BASE (HORAS EN EL FUTURO - HORIZONTAL PROTEGIDO) */}
                <Text style={styles.stepSubtitle}>1. Elige la Hora:</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.horizontalHoursScroll}
                  contentContainerStyle={styles.horizontalHoursContent}
                >
                  {horasDisponiblesHoy.map((item) => {
                    const esActiva = horaBloqueActivo?.hora24 === item.hora24;
                    return (
                      <TouchableOpacity
                        key={`${item.hora24}_${item.horaStr}_${item.ampm}`}
                        style={[styles.hourPill, esActiva && styles.hourPillActive]}
                        onPress={() => setHoraBloqueActivo(item)}
                      >
                        <Text style={[styles.hourPillText, esActiva && styles.hourPillTextActive]}>
                          {item.horaStr} {item.ampm}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* 2. SELECCIÓN DE TURNOS (INDICANDO HORA COMPLETA Y TIEMPO RESTANTE) */}
                <Text style={styles.stepSubtitle}>
                  2. Elige tu Turno para las {horaBloqueActivo?.horaStr} {horaBloqueActivo?.ampm}:
                </Text>
                {minutosDisponiblesBloque.length === 0 ? (
                  <View style={styles.noMinutesAlertBox}>
                    <Text style={styles.noMinutesAlertText}>
                      No hay turnos disponibles para las {horaBloqueActivo?.horaStr} {horaBloqueActivo?.ampm} que cumplan los 30 minutos requeridos de preparación. Por favor selecciona la siguiente hora.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.minutesGrid}>
                    {minutosDisponiblesBloque.map((min) => {
                      const horaStringCompleta = `${horaBloqueActivo.horaStr}:${min} ${horaBloqueActivo.ampm}`;
                      const estaOcupado = listaHorasOcupadas.includes(horaStringCompleta);
                      const estaSeleccionado = horaSeleccionada === horaStringCompleta;

                      const ahora = new Date();
                      const minActuales = ahora.getHours() * 60 + ahora.getMinutes();
                      const totalMinTurno = horaBloqueActivo.hora24 * 60 + parseInt(min, 10);
                      const diffMins = totalMinTurno - minActuales;

                      return (
                        <TouchableOpacity
                          key={min}
                          disabled={estaOcupado}
                          style={[
                            styles.minuteBtn,
                            estaOcupado && styles.minuteBtnOccupied,
                            estaSeleccionado && styles.minuteBtnSelected
                          ]}
                          onPress={() => {
                            setHoraSeleccionada(horaStringCompleta);
                            setModalHoraVisible(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.minuteBtnTimeText,
                              estaOcupado && styles.minuteBtnTextOccupied,
                              estaSeleccionado && styles.minuteBtnTextSelected
                            ]}
                          >
                            {estaOcupado ? 'OCUPADO' : `${horaBloqueActivo.horaStr}:${min} ${horaBloqueActivo.ampm}`}
                          </Text>
                          {!estaOcupado && (
                            <Text
                              style={[
                                styles.minuteBtnDiffText,
                                estaSeleccionado && { color: '#ffedd5' }
                              ]}
                            >
                              En {diffMins} min
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.btnSecondaryCancel}
              onPress={() => setModalHoraVisible(false)}
            >
              <Text style={styles.btnSecondaryCancelText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL 3: AGREGAR CANTIDAD (KG / GRAMOS / PESOS)
         ========================================================================= */}
      <Modal visible={modalAgregarItem} animationType="slide" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.standardModalCard}>
            <View style={styles.modalHeaderCloseRow}>
              <Text style={styles.modalDialogTitle} numberOfLines={1}>
                {productoSeleccionado?.nombre}
              </Text>
              <TouchableOpacity onPress={() => setModalAgregarItem(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalPriceBase}>
              Precio Base: ${productoSeleccionado?.precio} MXN / {productoSeleccionado?.unidad || 'Kg'}
            </Text>

            {/* SELECTOR DE UNIDADES */}
            <Text style={styles.inputLabel}>¿Cómo deseas pedirlo?</Text>
            <View style={styles.unitsTabsContainer}>
              {(['1/2 Litro', 'Litro', 'Porción', 'Pieza', 'Orden'].includes(productoSeleccionado?.unidad)
                ? [productoSeleccionado.unidad, 'Pesos']
                : ['Kg', 'Gramos', 'Pesos']
              ).map((unid) => (
                <TouchableOpacity
                  key={unid}
                  style={[styles.unitTabBtn, unidadSeleccionada === unid && styles.unitTabBtnActive]}
                  onPress={() => {
                    setUnidadSeleccionada(unid);
                    setCantidadInput('');
                  }}
                >
                  <Text style={[styles.unitTabBtnText, unidadSeleccionada === unid && styles.unitTabBtnTextActive]}>
                    {unid === 'Pesos' ? 'En Pesos ($)' : unid}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ATAJOS RÁPIDOS DE CANTIDAD */}
            <View style={styles.quickShortcutsRow}>
              {['1/2 Litro', 'Litro', 'Porción', 'Pieza', 'Orden'].includes(unidadSeleccionada) && (
                <>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('1')}>
                    <Text style={styles.shortcutChipText}>1 {unidadSeleccionada}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('2')}>
                    <Text style={styles.shortcutChipText}>2 {unidadSeleccionada}s</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('3')}>
                    <Text style={styles.shortcutChipText}>3 {unidadSeleccionada}s</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('4')}>
                    <Text style={styles.shortcutChipText}>4 {unidadSeleccionada}s</Text>
                  </TouchableOpacity>
                </>
              )}
              {unidadSeleccionada === 'Kg' && (
                <>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('0.5')}>
                    <Text style={styles.shortcutChipText}>0.5 Kg</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('1')}>
                    <Text style={styles.shortcutChipText}>1 Kg</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('1.5')}>
                    <Text style={styles.shortcutChipText}>1.5 Kg</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('2')}>
                    <Text style={styles.shortcutChipText}>2 Kg</Text>
                  </TouchableOpacity>
                </>
              )}
              {unidadSeleccionada === 'Gramos' && (
                <>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('250')}>
                    <Text style={styles.shortcutChipText}>250 g</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('500')}>
                    <Text style={styles.shortcutChipText}>500 g</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('750')}>
                    <Text style={styles.shortcutChipText}>750 g</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('1000')}>
                    <Text style={styles.shortcutChipText}>1000 g</Text>
                  </TouchableOpacity>
                </>
              )}
              {unidadSeleccionada === 'Pesos' && (
                <>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('100')}>
                    <Text style={styles.shortcutChipText}>$100</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('150')}>
                    <Text style={styles.shortcutChipText}>$150</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('200')}>
                    <Text style={styles.shortcutChipText}>$200</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shortcutChip} onPress={() => setCantidadInput('300')}>
                    <Text style={styles.shortcutChipText}>$300</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <TextInput
              style={styles.textInputModern}
              placeholder={
                unidadSeleccionada === 'Kg'
                  ? 'Cantidad en Kilos (ej. 1.5)'
                  : unidadSeleccionada === 'Gramos'
                    ? 'Cantidad en Gramos (ej. 500)'
                    : 'Cantidad en Pesos MXN (ej. 200)'
              }
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
              value={cantidadInput}
              onChangeText={setCantidadInput}
            />

            {/* PREVISUALIZACIÓN DE SUBTOTAL */}
            {cantidadInput !== '' && !isNaN(parseFloat(cantidadInput)) && (
              <View style={styles.subtotalBanner}>
                <Text style={styles.subtotalBannerLabel}>Subtotal estimado:</Text>
                <Text style={styles.subtotalBannerAmount}>
                  ${calcularSubtotalItem(productoSeleccionado?.precio, cantidadInput, unidadSeleccionada).toFixed(2)} MXN
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.btnModalPrimary} onPress={handleAgregarAlCarrito}>
              <Text style={styles.btnModalPrimaryText}>Añadir al Carrito 🛒</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondaryCancel} onPress={() => setModalAgregarItem(false)}>
              <Text style={styles.btnSecondaryCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL 4: LOGIN ADMINISTRADOR
         ========================================================================= */}
      <Modal visible={modalLoginVisible} animationType="fade" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.standardModalCard}>
            <View style={styles.modalHeaderCloseRow}>
              <Text style={styles.modalDialogTitle}>Acceso de Administración</Text>
              <TouchableOpacity onPress={() => setModalLoginVisible(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{ alignItems: 'center', marginVertical: 8 }}>
              <Image source={LOGO_IMG} style={{ width: 68, height: 68 }} resizeMode="contain" />
            </View>
            <Text style={styles.modalDialogSub}>Ingresa tus credenciales autorizadas</Text>

            <TextInput
              style={styles.textInputModern}
              placeholder="Correo electrónico admin"
              placeholderTextColor="#94a3b8"
              value={emailAdmin}
              onChangeText={setEmailAdmin}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.textInputModern}
              placeholder="Contraseña"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              value={passwordAdmin}
              onChangeText={setPasswordAdmin}
            />

            <TouchableOpacity style={styles.btnModalPrimary} onPress={handleLoginAdmin}>
              <Text style={styles.btnModalPrimaryText}>Iniciar Sesión</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondaryCancel} onPress={() => setModalLoginVisible(false)}>
              <Text style={styles.btnSecondaryCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL 5: NUEVO PRODUCTO (ADMIN)
         ========================================================================= */}
      <Modal visible={modalNuevoProducto} animationType="fade" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.standardModalCard}>
            <View style={styles.modalHeaderCloseRow}>
              <Text style={styles.modalDialogTitle}>Agregar Nuevo Producto</Text>
              <TouchableOpacity onPress={() => setModalNuevoProducto(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Nombre del Producto</Text>
              <TextInput
                style={styles.textInputModern}
                placeholder="Ej. Camarón Mediano con Cabeza"
                placeholderTextColor="#94a3b8"
                value={nombreNuevoProd}
                onChangeText={setNombreNuevoProd}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Precio Base (MXN)</Text>
              <TextInput
                style={styles.textInputModern}
                placeholder="Ej. 240"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={precioNuevoProd}
                onChangeText={setPrecioNuevoProd}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Categoría del Producto</Text>
              <View style={styles.categorySelectGrid}>
                {[
                  { id: 'preparados', label: '🥗 Preparados / Ceviches' },
                  { id: 'camaron', label: '🦐 Camarón' },
                  { id: 'pescado', label: '🐟 Pescado / Filete' },
                  { id: 'pulpo', label: '🐙 Pulpo / Mariscos' },
                  { id: 'complementos', label: '🍋 Complementos' }
                ].map((catItem) => (
                  <TouchableOpacity
                    key={catItem.id}
                    style={[styles.catSelectChip, categoriaNuevoProd === catItem.id && styles.catSelectChipActive]}
                    onPress={() => setCategoriaNuevoProd(catItem.id)}
                  >
                    <Text style={[styles.catSelectChipText, categoriaNuevoProd === catItem.id && styles.catSelectChipTextActive]}>
                      {catItem.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Unidad Principal</Text>
              <View style={styles.unitQuickSelectRow}>
                {['1/2 Litro', 'Litro', 'Porción', 'Kg', 'Pieza'].map((uOption) => (
                  <TouchableOpacity
                    key={uOption}
                    style={[styles.unitQuickChip, unidadNuevoProd === uOption && styles.unitQuickChipActive]}
                    onPress={() => setUnidadNuevoProd(uOption)}
                  >
                    <Text style={[styles.unitQuickChipText, unidadNuevoProd === uOption && styles.unitQuickChipTextActive]}>
                      {uOption}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.textInputModern, { marginTop: 6 }]}
                placeholder="O escribe otra unidad..."
                placeholderTextColor="#94a3b8"
                value={unidadNuevoProd}
                onChangeText={setUnidadNuevoProd}
              />
            </View>

            <TouchableOpacity style={styles.btnModalPrimary} onPress={handleAgregarProducto}>
              <Text style={styles.btnModalPrimaryText}>Guardar Producto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondaryCancel} onPress={() => setModalNuevoProducto(false)}>
              <Text style={styles.btnSecondaryCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL 6: EDITAR PRECIO (ADMIN)
         ========================================================================= */}
      <Modal visible={modalEditarPrecio} animationType="fade" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.standardModalCard}>
            <View style={styles.modalHeaderCloseRow}>
              <Text style={styles.modalDialogTitle}>Editar Precio</Text>
              <TouchableOpacity onPress={() => setModalEditarPrecio(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDialogSub}>Producto: {productoAEditar?.nombre}</Text>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Nuevo Precio (MXN):</Text>
              <TextInput
                style={styles.textInputModern}
                placeholder="Ej. 260"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={nuevoPrecioInput}
                onChangeText={setNuevoPrecioInput}
              />
            </View>

            <TouchableOpacity style={styles.btnModalPrimary} onPress={handleGuardarPrecio}>
              <Text style={styles.btnModalPrimaryText}>Actualizar Precio</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondaryCancel} onPress={() => setModalEditarPrecio(false)}>
              <Text style={styles.btnSecondaryCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL 7: EDITAR TELÉFONO DE WHATSAPP (ADMIN)
         ========================================================================= */}
      <Modal visible={modalEditarTelefono} animationType="fade" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.standardModalCard}>
            <View style={styles.modalHeaderCloseRow}>
              <Text style={styles.modalDialogTitle}>WhatsApp de Recepción</Text>
              <TouchableOpacity onPress={() => setModalEditarTelefono(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDialogSub}>Número donde el negocio recibirá los pedidos</Text>

            <TextInput
              style={styles.textInputModern}
              placeholder="Número a 10 dígitos (ej. 6681234567)"
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
              value={nuevoTelefonoInput}
              onChangeText={setNuevoTelefonoInput}
            />

            <TouchableOpacity style={styles.btnModalPrimary} onPress={handleGuardarTelefono}>
              <Text style={styles.btnModalPrimaryText}>Guardar Número</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondaryCancel} onPress={() => setModalEditarTelefono(false)}>
              <Text style={styles.btnSecondaryCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL 8: EDITAR DATOS BANCARIOS ESTRUCTURADOS (ADMIN)
         ========================================================================= */}
      <Modal visible={modalEditarBanco} animationType="fade" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.standardModalCard}>
            <View style={styles.modalHeaderCloseRow}>
              <Text style={styles.modalDialogTitle}>Editar Datos Bancarios</Text>
              <TouchableOpacity onPress={() => setModalEditarBanco(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDialogSub}>
              Configura los datos para que el cliente pueda copiarlos por separado
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Banco Destino:</Text>
              <TextInput
                style={styles.textInputModern}
                placeholder="Ej. BBVA, Santander, Banorte"
                placeholderTextColor="#94a3b8"
                value={inputBancoNombre}
                onChangeText={setInputBancoNombre}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Número de Tarjeta (16 dígitos):</Text>
              <TextInput
                style={styles.textInputModern}
                placeholder="Ej. 1234 5678 9012 3456"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={inputBancoTarjeta}
                onChangeText={setInputBancoTarjeta}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>CLABE Interbancaria (18 dígitos):</Text>
              <TextInput
                style={styles.textInputModern}
                placeholder="Ej. 012180012345678901"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={inputBancoClabe}
                onChangeText={setInputBancoClabe}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Titular de la Cuenta:</Text>
              <TextInput
                style={styles.textInputModern}
                placeholder="Ej. Pescadería Batequis"
                placeholderTextColor="#94a3b8"
                value={inputBancoTitular}
                onChangeText={setInputBancoTitular}
              />
            </View>

            <TouchableOpacity style={styles.btnModalPrimary} onPress={handleGuardarBanco}>
              <Text style={styles.btnModalPrimaryText}>Guardar Datos Bancarios</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondaryCancel} onPress={() => setModalEditarBanco(false)}>
              <Text style={styles.btnSecondaryCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL 9: EDITAR HORARIOS COMERCIALES (ADMIN)
         ========================================================================= */}
      <Modal visible={modalEditarHorarios} animationType="fade" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.standardModalCard}>
            <View style={styles.modalHeaderCloseRow}>
              <Text style={styles.modalDialogTitle}>Horario Comercial</Text>
              <TouchableOpacity onPress={() => setModalEditarHorarios(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDialogSub}>Formato 24 horas (ej. 9 para 9 AM, 17 para 5 PM)</Text>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Hora de Apertura (0 - 23):</Text>
              <TextInput
                style={styles.textInputModern}
                placeholder="9"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={nuevaAperturaInput}
                onChangeText={setNuevaAperturaInput}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Hora de Cierre (0 - 23):</Text>
              <TextInput
                style={styles.textInputModern}
                placeholder="17"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={nuevoCierreInput}
                onChangeText={setNuevoCierreInput}
              />
            </View>

            <TouchableOpacity style={styles.btnModalPrimary} onPress={handleGuardarHorarios}>
              <Text style={styles.btnModalPrimaryText}>Guardar Horarios</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondaryCancel} onPress={() => setModalEditarHorarios(false)}>
              <Text style={styles.btnSecondaryCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL 10: EDITAR UBICACIÓN MAPS (ADMIN)
         ========================================================================= */}
      <Modal visible={modalEditarUbicacion} animationType="fade" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.standardModalCard}>
            <View style={styles.modalHeaderCloseRow}>
              <Text style={styles.modalDialogTitle}>Enlace de Google Maps</Text>
              <TouchableOpacity onPress={() => setModalEditarUbicacion(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.textInputModern}
              placeholder="https://maps.google.com/..."
              placeholderTextColor="#94a3b8"
              value={nuevaUbicacionInput}
              onChangeText={setNuevaUbicacionInput}
            />

            <TouchableOpacity style={styles.btnModalPrimary} onPress={handleGuardarUbicacion}>
              <Text style={styles.btnModalPrimaryText}>Guardar Enlace</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondaryCancel} onPress={() => setModalEditarUbicacion(false)}>
              <Text style={styles.btnSecondaryCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL 11: AVISO / ALERTA INTEGRADA
         ========================================================================= */}
      <Modal visible={alertaModal.visible} animationType="fade" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.alertCard}>
            <Text style={styles.alertIcon}>
              {alertaModal.tipo === 'error' ? '⚠️' : alertaModal.tipo === 'exito' ? '✅' : 'ℹ️'}
            </Text>
            <Text style={styles.alertTitle}>{alertaModal.titulo}</Text>
            <Text style={styles.alertMessage}>{alertaModal.mensaje}</Text>
            <TouchableOpacity
              style={[
                styles.btnAlertOk,
                alertaModal.tipo === 'error' ? { backgroundColor: '#ef4444' } : { backgroundColor: '#0284c7' }
              ]}
              onPress={() => setAlertaModal({ ...alertaModal, visible: false })}
            >
              <Text style={styles.btnAlertOkText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0c4a6e',
  },
  appContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    backgroundColor: '#f8fafc',
    position: 'relative',
    overflow: 'hidden',
  },
  watermarkBgContainer: {
    position: 'absolute',
    top: 60,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
    opacity: 0.04,
  },
  watermarkBgImage: {
    width: 320,
    height: 320,
  },

  // --- HEADER ---
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0c4a6e',
    borderBottomWidth: 1,
    borderBottomColor: '#075985',
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogoContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#38bdf8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  headerLogoImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#bae6fd',
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnHeaderAdmin: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  btnHeaderAdminOut: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  btnHeaderAdminText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  mainScroll: {
    flex: 1,
    padding: 14,
  },

  // --- STATUS BANNER ---
  statusBannerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statusPillWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDotLive: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  statusStateTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  statusStateHours: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  btnMapsBanner: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 8,
  },
  btnMapsBannerText: {
    color: '#0284c7',
    fontSize: 12,
    fontWeight: '700',
  },

  // --- ADMIN DASHBOARD ---
  adminDashboardCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  adminDashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  adminDashboardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#b45309',
  },
  adminDashboardBadge: {
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  adminTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
  },
  adminTabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  adminTabBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  adminTabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400e',
  },
  adminTabBtnTextActive: {
    color: '#b45309',
    fontWeight: '800',
  },
  adminTabContent: {
    marginTop: 4,
  },
  btnAdminPrimaryAction: {
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnAdminPrimaryActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  adminTipText: {
    fontSize: 11,
    color: '#78350f',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  adminSubSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#78350f',
  },
  adminHorariosSubNote: {
    fontSize: 11,
    color: '#16a34a',
    fontWeight: '600',
    marginBottom: 8,
  },
  btnLimpiarTodoTurnos: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  btnLimpiarTodoTurnosText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#dc2626',
  },
  horarioRowAdmin: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  horarioHoraText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  horarioClienteText: {
    fontSize: 11,
    color: '#64748b',
  },
  btnLiberarTurno: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  btnLiberarTurnoText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '700',
  },
  adminStateToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  btnStateToggle: {
    flex: 1,
    paddingVertical: 8,
    marginHorizontal: 2,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  btnStateActiveOpen: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  btnStateActiveAuto: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  btnStateActiveClosed: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  btnStateToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#78350f',
  },
  adminConfigActionsGrid: {
    gap: 8,
  },
  btnConfigItem: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  btnConfigItemTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  btnConfigItemValue: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },

  // --- TARJETAS COMUNES ---
  contentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeaderWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardHeaderIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  cardSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },

  // --- RECENT ORDER ---
  recentOrderCard: {
    backgroundColor: '#eef2ff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  recentOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentOrderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3730a3',
  },
  recentOrderDate: {
    fontSize: 11,
    color: '#6366f1',
    fontWeight: '600',
  },
  recentOrderSummary: {
    fontSize: 12,
    color: '#4338ca',
    marginTop: 4,
    fontWeight: '500',
  },
  btnRepeatOrder: {
    backgroundColor: '#4f46e5',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  btnRepeatOrderText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  // --- FORMULARIOS ---
  formGroup: {
    marginBottom: 12,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputHelperSaved: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  textInputModern: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#ffffff',
    color: '#0f172a',
  },

  // --- BUSCADOR Y FILTROS ---
  searchContainer: {
    position: 'relative',
    marginBottom: 10,
  },
  searchInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
  },
  btnClearSearch: {
    position: 'absolute',
    right: 10,
    top: 9,
    padding: 4,
  },
  btnClearSearchText: {
    color: '#94a3b8',
    fontWeight: '700',
  },
  filtersRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#0284c7',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },

  // --- CATEGORÍAS HORIZONTALES ---
  categoryScrollView: {
    marginBottom: 10,
  },
  categoryScrollContainer: {
    paddingVertical: 4,
    gap: 8,
  },
  categoryPill: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryPillActive: {
    backgroundColor: '#ea580c',
    borderColor: '#ea580c',
    shadowColor: '#ea580c',
    shadowOpacity: 0.25,
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  categoryPillTextActive: {
    color: '#ffffff',
  },

  // --- PRODUCTOS ---
  productCardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  productBadgeRow: {
    marginBottom: 4,
  },
  productBadgeText: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  productInfoCol: {
    flex: 1,
    marginRight: 10,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  productPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  productPriceAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0c4a6e',
  },
  productPriceUnit: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 3,
  },
  productActionCol: {
    alignItems: 'flex-end',
  },
  btnAddProductBtn: {
    backgroundColor: '#ea580c',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  btnAddProductBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  badgeAgotadoPill: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeAgotadoText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
  },
  productAdminToolsRow: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 4,
  },
  btnAdminTool: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  // --- ESTADO VACÍO ---
  emptyStateBox: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyStateEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  emptyStateSub: {
    fontSize: 12,
    color: '#94a3b8',
  },

  // --- CARRITO ---
  cartItemsList: {
    marginBottom: 12,
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  cartItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  cartItemDetail: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  cartItemSubtotal: {
    fontWeight: '700',
    color: '#0f172a',
  },
  btnRemoveCartItem: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  btnRemoveCartItemText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '800',
  },
  cartTotalHighlightBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cartTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },
  cartTotalSub: {
    fontSize: 10,
    color: '#15803d',
  },
  cartTotalNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#15803d',
  },

  // --- FORMA DE PAGO ---
  paymentMethodsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  paymentMethodCard: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  paymentMethodCardActive: {
    borderColor: '#0284c7',
    backgroundColor: '#f0f9ff',
  },
  paymentMethodEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  paymentMethodTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  paymentMethodTitleActive: {
    color: '#0284c7',
    fontWeight: '800',
  },
  paymentMethodDesc: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },

  // --- TARJETA BANCARIA ESTRUCTURADA CON COPIADO INDIVIDUAL ---
  bankCardStructured: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 4,
  },
  bankCardStructuredHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },
  bankCardStructuredSub: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 10,
  },
  bankFieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bankFieldLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  bankFieldValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 1,
  },
  bankFieldDigits: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0284c7',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 1,
    letterSpacing: 0.5,
  },
  btnCopySingle: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  btnCopySingleActive: {
    backgroundColor: '#dcfce7',
  },
  btnCopySingleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  btnCopySingleTextActive: {
    color: '#15803d',
  },
  btnCopyAllBank: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  btnCopyAllBankText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  // --- ADJUNTAR COMPROBANTE ---
  receiptUploadBox: {
    marginTop: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  receiptUploadBoxActive: {
    borderColor: '#10b981',
    borderStyle: 'solid',
    backgroundColor: '#f0fdf4',
  },
  receiptUploadIcon: {
    fontSize: 26,
    marginBottom: 4,
  },
  receiptUploadTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  receiptUploadSub: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 10,
  },
  btnUploadReceipt: {
    backgroundColor: '#0c4a6e',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  btnUploadReceiptText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  receiptPreviewContainer: {
    width: '100%',
    alignItems: 'center',
  },
  receiptPreviewImage: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginBottom: 8,
  },
  receiptPreviewActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  btnChangeReceipt: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  btnChangeReceiptText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  btnRemoveReceipt: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  btnRemoveReceiptText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
  },

  // --- AVISO TIEMPO DE PREPARACIÓN (30 MIN) ---
  prepTimeNoticeBox: {
    backgroundColor: '#fff7ed',
    borderWidth: 1.5,
    borderColor: '#fed7aa',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  prepTimeNoticeIcon: {
    fontSize: 20,
  },
  prepTimeNoticeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#c2410c',
  },
  prepTimeNoticeDesc: {
    fontSize: 11,
    color: '#9a3412',
    marginTop: 2,
    lineHeight: 15,
  },

  // --- SELECTOR DE HORA TRIGGER ---
  timeSelectorTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  timeSelectorTriggerActive: {
    borderColor: '#0284c7',
    backgroundColor: '#f0f9ff',
  },
  timeSelectorTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  timeSelectorEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  timeSelectorText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  timeSelectorTextActive: {
    color: '#0284c7',
    fontWeight: '800',
  },
  timeSelectorArrow: {
    fontSize: 12,
    color: '#64748b',
  },

  // --- BOTÓN PRINCIPAL CONFIRMAR ---
  btnMainOrderSubmit: {
    backgroundColor: '#ea580c',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  btnMainOrderSubmitDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
    elevation: 0,
  },
  btnMainOrderSubmitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  btnMainOrderSubmitSubtext: {
    color: '#ffedd5',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },

  // --- NOTAS DE PREPARACIÓN ---
  notesChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  noteChip: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  noteChipActive: {
    backgroundColor: '#ffedd5',
    borderColor: '#ea580c',
  },
  noteChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  noteChipTextActive: {
    color: '#ea580c',
    fontWeight: '700',
  },

  // --- TURNO RÁPIDO ---
  btnQuickPickup: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  btnQuickPickupActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#16a34a',
  },
  btnQuickPickupIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  btnQuickPickupTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803d',
  },
  btnQuickPickupTitleActive: {
    color: '#166534',
  },
  btnQuickPickupSub: {
    fontSize: 11,
    color: '#16a34a',
    marginTop: 2,
  },
  btnQuickPickupSelectBadge: {
    backgroundColor: '#e2e8f0',
    color: '#475569',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
  },
  btnQuickPickupSelectBadgeActive: {
    backgroundColor: '#16a34a',
    color: '#ffffff',
  },

  // --- ADMIN SAMPLE Y CATEGORÍAS ---
  btnAdminSampleAction: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnAdminSampleActionText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  categorySelectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  catSelectChip: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  catSelectChipActive: {
    backgroundColor: '#ea580c',
    borderColor: '#ea580c',
  },
  catSelectChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  catSelectChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  unitQuickSelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  unitQuickChip: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  unitQuickChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  unitQuickChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  unitQuickChipTextActive: {
    color: '#ffffff',
  },
  btnMainOrderSubmitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  btnMainOrderSubmitSubtext: {
    color: '#d1fae5',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },

  // --- MODAL BASE ---
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  standardModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 440,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  modalHeaderCloseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalDialogTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1,
  },
  modalCloseIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: '#94a3b8',
    padding: 4,
  },
  modalDialogSub: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 14,
  },
  modalPriceBase: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7',
    marginBottom: 12,
  },
  btnModalPrimary: {
    backgroundColor: '#0284c7',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  btnModalPrimaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  btnSecondaryCancel: {
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
  },
  btnSecondaryCancelText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },

  // --- MODAL TICKET DIGITAL FORMAL ---
  ticketModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    width: '100%',
    maxWidth: 480,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  digitalTicketReceipt: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    position: 'relative',
    overflow: 'hidden',
  },
  ticketWatermarkContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
    opacity: 0.035,
  },
  ticketWatermarkImage: {
    width: 220,
    height: 220,
  },
  ticketTopHeader: {
    alignItems: 'center',
    marginBottom: 10,
  },
  ticketLogoImg: {
    width: 76,
    height: 76,
    alignSelf: 'center',
    marginBottom: 6,
  },
  ticketStoreName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  ticketSubStore: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1,
    marginTop: 2,
  },
  ticketFolioBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 6,
  },
  ticketFolioText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369a1',
  },
  ticketDividerDashed: {
    height: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    marginVertical: 10,
  },
  ticketDividerSolid: {
    height: 2,
    backgroundColor: '#0f172a',
    marginVertical: 10,
  },
  ticketDataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  ticketDataRowHighlight: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginVertical: 4,
  },
  ticketDataLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  ticketDataValue: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700',
  },
  ticketDataLabelHighlight: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '700',
  },
  ticketDataValueHighlight: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '900',
  },
  ticketProductsHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 6,
  },
  ticketItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  ticketItemName: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
    marginRight: 6,
  },
  ticketItemPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  ticketTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  ticketTotalLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
  },
  ticketTotalAmount: {
    fontSize: 17,
    fontWeight: '900',
    color: '#059669',
  },
  ticketFootnote: {
    fontSize: 10,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  ticketActionsContainer: {
    marginTop: 14,
  },
  ticketSuccessNotice: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1.5,
    borderColor: '#6ee7b7',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  ticketSuccessNoticeIcon: {
    fontSize: 24,
  },
  ticketSuccessNoticeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065f46',
  },
  ticketSuccessNoticeDesc: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
    lineHeight: 16,
  },
  btnTicketWhatsAppHelp: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1.5,
    borderColor: '#10b981',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  btnTicketWhatsAppHelpIcon: {
    fontSize: 26,
  },
  btnTicketWhatsAppHelpTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065f46',
  },
  btnTicketWhatsAppHelpSub: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
    fontWeight: '600',
  },
  btnCloseTicketModalPrimary: {
    backgroundColor: '#0c4a6e',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#0c4a6e',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 8,
  },
  btnCloseTicketModalPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  btnActionCopyDetails: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnActionCopyDetailsText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  btnCloseTicketModalText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },

  // --- MODAL SELECTOR DE TIEMPO ---
  timePickerModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    width: '100%',
    maxWidth: 460,
    maxHeight: '90%',
  },
  timePickerScrollableBody: {
    flexGrow: 1,
    flexShrink: 1,
  },
  timePickerScrollableBodyContent: {
    paddingBottom: 6,
  },
  noHoursBox: {
    backgroundColor: '#fff1f2',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  noHoursEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  noHoursTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#be123c',
    textAlign: 'center',
  },
  noHoursSub: {
    fontSize: 12,
    color: '#9f1239',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  stepSubtitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginTop: 8,
    marginBottom: 8,
  },
  horizontalHoursScroll: {
    height: 48,
    minHeight: 48,
    maxHeight: 48,
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 12,
  },
  horizontalHoursContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingRight: 10,
  },
  hourPill: {
    height: 38,
    paddingHorizontal: 15,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  hourPillActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  hourPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  hourPillTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  minutesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  minuteBtn: {
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    marginBottom: 8,
  },
  minuteBtnOccupied: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  minuteBtnSelected: {
    backgroundColor: '#ea580c',
    borderColor: '#ea580c',
  },
  minuteBtnTimeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  minuteBtnDiffText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
    marginTop: 2,
  },
  minuteBtnTextOccupied: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '800',
  },
  minuteBtnTextSelected: {
    color: '#ffffff',
    fontWeight: '800',
  },
  noMinutesAlertBox: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  noMinutesAlertText: {
    fontSize: 12,
    color: '#c2410c',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },

  // --- MODAL CANTIDAD UNIDADES ---
  unitsTabsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  unitTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  unitTabBtnActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  unitTabBtnText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
  },
  unitTabBtnTextActive: {
    color: '#0284c7',
    fontWeight: '800',
  },
  quickShortcutsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  shortcutChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  shortcutChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  subtotalBanner: {
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtotalBannerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803d',
  },
  subtotalBannerAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#15803d',
  },

  // --- ALERTA POPUP INTEGRADA ---
  alertCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  alertIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  btnAlertOk: {
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnAlertOkText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  textWhite: {
    color: '#ffffff',
  },
  emptyNoticeText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
});