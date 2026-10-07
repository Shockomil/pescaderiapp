import React, { useState, useEffect, useMemo } from 'react';
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
  Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// Estructura de horas para recolección
const HORAS_JORNADA = [
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
];

const MINUTOS_INTERVALOS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export default function App() {
  // --- AUTENTICACIÓN ADMIN ---
  const [isAdmin, setIsAdmin] = useState(false);
  const [modalLoginVisible, setModalLoginVisible] = useState(false);
  const [emailAdmin, setEmailAdmin] = useState('');
  const [passwordAdmin, setPasswordAdmin] = useState('');

  // --- DATOS EN TIEMPO REAL (FIRESTORE) ---
  const [productos, setProductos] = useState([]);
  const [horariosOcupadosDocs, setHorariosOcupadosDocs] = useState([]); // [{ id, hora, cliente, fechaRegistro }]
  const [telefonoContacto, setTelefonoContacto] = useState('6681234567');
  const [datosBancarios, setDatosBancarios] = useState(
    'Banco: BBVA\nTarjeta: 1234 5678 9012 3456\nCLABE: 012180012345678901\nTitular: Pescadería Batequis'
  );
  const [urlUbicacion, setUrlUbicacion] = useState('https://maps.google.com');

  // Configuración de horario y estado del negocio
  const [horaApertura, setHoraApertura] = useState(9); // 9 AM
  const [horaCierre, setHoraCierre] = useState(17);    // 5 PM
  const [modoForzadoEstado, setModoForzadoEstado] = useState('auto'); // 'auto', 'abierto', 'cerrado'
  const [estaAbierto, setEstaAbierto] = useState(true);

  // --- DATOS DEL CLIENTE E HISTORIAL ---
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [historialPedidos, setHistorialPedidos] = useState([]);

  // --- BÚSQUEDA Y FILTROS CLIENTE ---
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [filtroDisponibilidad, setFiltroDisponibilidad] = useState('todos'); // 'todos', 'disponibles'

  // --- ESTADO DEL CARRITO ---
  const [carrito, setCarrito] = useState([]);
  const [modalAgregarItem, setModalAgregarItem] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [cantidadInput, setCantidadInput] = useState('');
  const [unidadSeleccionada, setUnidadSeleccionada] = useState('Kg');
  const [metodoPago, setMetodoPago] = useState('efectivo');

  // --- SELECTOR DE HORARIO ---
  const [horaSeleccionada, setHoraSeleccionada] = useState(null);
  const [modalHoraVisible, setModalHoraVisible] = useState(false);
  const [horaBloqueActivo, setHoraBloqueActivo] = useState(HORAS_JORNADA[0]);

  // --- MODAL DE CONFIRMACIÓN / TICKET DIGITAL ---
  const [modalTicketVisible, setModalTicketVisible] = useState(false);
  const [ticketActual, setTicketActual] = useState(null);
  const [copiadoFeedback, setCopiadoFeedback] = useState(false);

  // --- NOTIFICACIÓN PERSONALIZADA (REEMPLAZO UNIVERSAL DE Alert.alert) ---
  const [alertaModal, setAlertaModal] = useState({ visible: false, titulo: '', mensaje: '', tipo: 'info' });

  // --- PANEL DE ADMINISTRACIÓN ---
  const [adminTab, setAdminTab] = useState('catalogo'); // 'catalogo', 'horarios', 'config'
  const [modalNuevoProducto, setModalNuevoProducto] = useState(false);
  const [nombreNuevoProd, setNombreNuevoProd] = useState('');
  const [precioNuevoProd, setPrecioNuevoProd] = useState('');
  const [unidadNuevoProd, setUnidadNuevoProd] = useState('Kg');

  const [modalEditarPrecio, setModalEditarPrecio] = useState(false);
  const [productoAEditar, setProductoAEditar] = useState(null);
  const [nuevoPrecioInput, setNuevoPrecioInput] = useState('');

  const [modalEditarTelefono, setModalEditarTelefono] = useState(false);
  const [nuevoTelefonoInput, setNuevoTelefonoInput] = useState('');

  const [modalEditarBanco, setModalEditarBanco] = useState(false);
  const [nuevoBancoInput, setNuevoBancoInput] = useState('');

  const [modalEditarUbicacion, setModalEditarUbicacion] = useState(false);
  const [nuevaUbicacionInput, setNuevaUbicacionInput] = useState('');

  const [modalEditarHorarios, setModalEditarHorarios] = useState(false);
  const [nuevaAperturaInput, setNuevaAperturaInput] = useState('9');
  const [nuevoCierreInput, setNuevoCierreInput] = useState('17');

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

  // 3. Escuchar horarios ocupados
  useEffect(() => {
    const unsubscribeHorarios = onSnapshot(collection(db, 'horarios_ocupados'), (snapshot) => {
      const listaHorarios = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setHorariosOcupadosDocs(listaHorarios);
    });
    return () => unsubscribeHorarios();
  }, []);

  // Lista simple de horas ocupadas para el selector
  const listaHorasOcupadas = useMemo(() => {
    return horariosOcupadosDocs.map((item) => item.hora);
  }, [horariosOcupadosDocs]);

  // 4. Escuchar configuración general
  useEffect(() => {
    const unsubscribeConfig = onSnapshot(doc(db, 'configuracion', 'general'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.telefono) setTelefonoContacto(data.telefono);
        if (data.datosBancarios) setDatosBancarios(data.datosBancarios);
        if (data.urlUbicacion) setUrlUbicacion(data.urlUbicacion);
        if (data.horaApertura !== undefined) setHoraApertura(Number(data.horaApertura));
        if (data.horaCierre !== undefined) setHoraCierre(Number(data.horaCierre));
        if (data.modoForzadoEstado) setModoForzadoEstado(data.modoForzadoEstado);
      }
    });
    return () => unsubscribeConfig();
  }, []);

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

  // 6. Cargar historial local
  useEffect(() => {
    cargarHistorialLocal();
  }, []);

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

  // --- FILTRADO DE PRODUCTOS ---
  const productosFiltrados = useMemo(() => {
    return productos.filter((prod) => {
      const coincideNombre = (prod.nombre || '').toLowerCase().includes(busquedaProducto.toLowerCase());
      if (filtroDisponibilidad === 'disponibles') {
        return coincideNombre && prod.disponible;
      }
      return coincideNombre;
    });
  }, [productos, busquedaProducto, filtroDisponibilidad]);

  // --- SUBTOTOTAl Y CARRITO ---
  const abrirModalSeleccion = (producto) => {
    setProductoSeleccionado(producto);
    setCantidadInput('');
    setUnidadSeleccionada(producto.unidad === 'Pieza' ? 'Pieza' : 'Kg');
    setModalAgregarItem(true);
  };

  const calcularSubtotalItem = (precioBase, cantidad, unidad) => {
    const cant = parseFloat(cantidad) || 0;
    const prec = parseFloat(precioBase) || 0;
    if (unidad === 'Kg' || unidad === 'Pieza') return cant * prec;
    if (unidad === 'Gramos') return (cant / 1000) * prec;
    if (unidad === 'Pesos') return cant;
    return 0;
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
      cantidad: cant,
      unidad: unidadSeleccionada,
      subtotal: subtotal
    };
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

  // --- COPIAR AL PORTAPAPELES (WEB / NATIVE) ---
  const copiarAlPortapapeles = async (texto, mensajeExito = 'Copiado al portapapeles') => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(texto);
      } else {
        // En plataformas móviles si no hay Clipboard nativo instalado, creamos un input temporal en web
        if (typeof document !== 'undefined') {
          const tempInput = document.createElement('textarea');
          tempInput.value = texto;
          document.body.appendChild(tempInput);
          tempInput.select();
          document.execCommand('copy');
          document.body.removeChild(tempInput);
        }
      }
      setCopiadoFeedback(true);
      setTimeout(() => setCopiadoFeedback(false), 3000);
      mostrarAviso('Copiado', mensajeExito, 'exito');
    } catch (err) {
      mostrarAviso('Información', 'Selecciona el texto para copiarlo manualmente.');
    }
  };

  // --- APERTURA ROBUSTA DE WHATSAPP (SOLUCIÓN WEB/PWA Y NATIVE) ---
  const abrirWhatsAppConMensaje = (urlWhatsApp) => {
    if (Platform.OS === 'web') {
      try {
        // En Web / PWA, abrimos en una nueva pestaña o redirigimos de inmediato
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
    if (carrito.length === 0) {
      mostrarAviso('Carrito Vacío', 'Agrega al menos un producto a tu pedido para continuar.', 'error');
      return;
    }
    if (!horaSeleccionada) {
      mostrarAviso('Horario Requerido', 'Selecciona la hora estimada en la que pasarás por tu pedido.', 'error');
      return;
    }

    try {
      // 1. Guardar hora ocupada en Firestore
      await addDoc(collection(db, 'horarios_ocupados'), {
        hora: horaSeleccionada,
        cliente: nombreCliente.trim(),
        telefono: telefonoCliente.trim() || 'No proporcionado',
        total: calcularTotalCarrito(),
        fechaRegistro: new Date().toISOString()
      });

      // 2. Generar Folio Único
      const folio = 'PB-' + Math.floor(1000 + Math.random() * 9000);
      const total = calcularTotalCarrito();
      const metodoPagoTexto = metodoPago === 'transferencia' ? '💳 Transferencia Bancaria' : '💵 Efectivo en Sucursal';
      const fechaHoy = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

      // 3. Guardar en historial local del dispositivo
      const registroLocal = {
        folio: folio,
        fecha: fechaHoy,
        nombreCliente: nombreCliente.trim(),
        telefonoCliente: telefonoCliente.trim(),
        total: total,
        hora: horaSeleccionada,
        metodoPago: metodoPagoTexto,
        carrito: [...carrito]
      };
      await guardarPedidoEnHistorial(registroLocal);

      // 4. Construir formato de texto para WhatsApp con formato estructurado
      const lineasProductos = carrito.map((item) => {
        const detalleCantidad = item.unidad === 'Pesos'
          ? `$${item.cantidad} MXN`
          : `${item.cantidad} ${item.unidad}`;
        return `• *${item.nombre}*: ${detalleCantidad} ➔ $${item.subtotal.toFixed(2)} MXN`;
      }).join('\n');

      const contactoTexto = telefonoCliente.trim() ? `\n📞 *TEL:* ${telefonoCliente.trim()}` : '';

      const mensajeWhatsApp =
        `🐟 *PESCADERÍA BATEQUIS* 🐟\n` +
        `🧾 *FOLIO:* #${folio}\n` +
        `📅 *FECHA:* ${fechaHoy}\n` +
        `⏰ *HORA RECOLECCIÓN:* ${horaSeleccionada}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *CLIENTE:* ${nombreCliente.trim()}${contactoTexto}\n` +
        `💳 *MÉTODO DE PAGO:* ${metodoPagoTexto}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `🛒 *PRODUCTOS DEL PEDIDO:*\n` +
        `${lineasProductos}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 *TOTAL ESTIMADO:* $${total.toFixed(2)} MXN\n` +
        (metodoPago === 'transferencia' ? `📌 *Nota:* Te adjuntaré el comprobante de transferencia.\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `¿Me confirman la recepción de este pedido, por favor?`;

      // Limpiar y validar número telefónico para WhatsApp
      const cleanPhone = (telefonoContacto || '6681234567').replace(/\D/g, '');
      const fullPhone = cleanPhone.startsWith('52') && cleanPhone.length > 10 ? cleanPhone : `52${cleanPhone}`;
      const urlWhatsApp = `https://wa.me/${fullPhone}?text=${encodeURIComponent(mensajeWhatsApp)}`;

      // 5. Crear objeto de Ticket Digital
      const ticketData = {
        folio: folio,
        fecha: fechaHoy,
        cliente: nombreCliente.trim(),
        telefono: telefonoCliente.trim(),
        hora: horaSeleccionada,
        metodoPago: metodoPagoTexto,
        total: total,
        carrito: [...carrito],
        mensajeCompleto: mensajeWhatsApp,
        urlWhatsApp: urlWhatsApp
      };

      setTicketActual(ticketData);
      setModalTicketVisible(true);

      // Limpiar formulario y carrito
      setCarrito([]);
      setHoraSeleccionada(null);
    } catch (error) {
      console.error(error);
      mostrarAviso('Error', 'Ocurrió un problema al reservar tu pedido. Por favor intenta de nuevo.', 'error');
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
        unidad: unidadNuevoProd,
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

  const handleLiberarHorario = async (idHorario, horaTexto) => {
    try {
      await deleteDoc(doc(db, 'horarios_ocupados', idHorario));
      mostrarAviso('Horario Liberado', `El turno de las ${horaTexto} vuelve a estar libre.`, 'exito');
    } catch (error) {
      mostrarAviso('Error', 'No se pudo liberar el horario.', 'error');
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

  const handleGuardarBanco = async () => {
    if (!nuevoBancoInput.trim()) {
      mostrarAviso('Información Requerida', 'Ingresa los datos bancarios para transferencia.', 'error');
      return;
    }
    try {
      await setDoc(doc(db, 'configuracion', 'general'), {
        datosBancarios: nuevoBancoInput.trim()
      }, { merge: true });
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
      <StatusBar barStyle="light-content" backgroundColor="#0369a1" />

      {/* CONTENEDOR PRINCIPAL RESPONSIVE */}
      <View style={styles.appContainer}>
        {/* ENCABEZADO PREMIUM */}
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <View style={styles.headerLogoBadge}>
              <Text style={styles.headerLogoIcon}>🐟</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>Pescadería Batequis</Text>
              <Text style={styles.headerSubtitle}>Pescados y Mariscos Frescos</Text>
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
                    ⏰ Turnos ({horariosOcupadosDocs.length})
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
                  <TouchableOpacity
                    style={styles.btnAdminPrimaryAction}
                    onPress={() => setModalNuevoProducto(true)}
                  >
                    <Text style={styles.btnAdminPrimaryActionText}>➕ Agregar Nuevo Producto</Text>
                  </TouchableOpacity>
                  <Text style={styles.adminTipText}>
                    💡 Puedes alternar rápidamente si un producto está agotado o disponible, editar su precio o retirarlo.
                  </Text>
                </View>
              )}

              {/* TAB 2: GESTIÓN DE HORARIOS RESERVADOS */}
              {adminTab === 'horarios' && (
                <View style={styles.adminTabContent}>
                  <Text style={styles.adminSubSectionTitle}>Horarios Reservados de Hoy:</Text>
                  {horariosOcupadosDocs.length === 0 ? (
                    <Text style={styles.emptyNoticeText}>No hay horarios ocupados registrados.</Text>
                  ) : (
                    horariosOcupadosDocs.map((hor) => (
                      <View key={hor.id} style={styles.horarioRowAdmin}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.horarioHoraText}>{hor.hora}</Text>
                          <Text style={styles.horarioClienteText}>Cliente: {hor.cliente || 'Sin nombre'}</Text>
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
                      <Text style={styles.btnConfigItemTitle}>⏰ Horario de Apertura</Text>
                      <Text style={styles.btnConfigItemValue}>{horaApertura}:00 hrs a {horaCierre}:00 hrs</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnConfigItem}
                      onPress={() => {
                        setNuevoBancoInput(datosBancarios);
                        setModalEditarBanco(true);
                      }}
                    >
                      <Text style={styles.btnConfigItemTitle}>💳 Datos para Transferencia</Text>
                      <Text style={styles.btnConfigItemValue} numberOfLines={1}>{datosBancarios.split('\n')[0]}</Text>
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
              <Text style={styles.inputLabel}>Nombre Completo *</Text>
              <TextInput
                style={styles.textInputModern}
                placeholder="Ej. Juan Pérez"
                placeholderTextColor="#94a3b8"
                value={nombreCliente}
                onChangeText={setNombreCliente}
              />
            </View>
            <View style={[styles.formGroup, { marginBottom: 0 }]}>
              <Text style={styles.inputLabel}>Teléfono Celular (Opcional)</Text>
              <TextInput
                style={styles.textInputModern}
                placeholder="Ej. 6681234567"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                value={telefonoCliente}
                onChangeText={setTelefonoCliente}
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
                  Solo Disponibles
                </Text>
              </TouchableOpacity>
            </View>

            {/* LISTADO DE PRODUCTOS */}
            {productosFiltrados.length === 0 ? (
              <View style={styles.emptyStateBox}>
                <Text style={styles.emptyStateEmoji}>🌊</Text>
                <Text style={styles.emptyStateTitle}>No se encontraron productos</Text>
                <Text style={styles.emptyStateSub}>Prueba con otro término de búsqueda.</Text>
              </View>
            ) : (
              productosFiltrados.map((prod) => (
                <View key={prod.id} style={styles.productCardItem}>
                  <View style={styles.productInfoCol}>
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

          {/* SECCIÓN 4: FORMA DE PAGO */}
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
                <Text style={styles.paymentMethodDesc}>Envías comprobante</Text>
              </TouchableOpacity>
            </View>

            {metodoPago === 'transferencia' && (
              <View style={styles.bankInfoContainer}>
                <View style={styles.bankInfoHeader}>
                  <Text style={styles.bankInfoTitle}>🏦 Cuenta para Transferencia:</Text>
                  <TouchableOpacity
                    style={styles.btnCopyBank}
                    onPress={() => copiarAlPortapapeles(datosBancarios, 'Datos bancarios copiados')}
                  >
                    <Text style={styles.btnCopyBankText}>📋 Copiar Datos</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.bankInfoText}>{datosBancarios}</Text>
                <Text style={styles.bankInfoNote}>
                  📌 Al enviar tu pedido por WhatsApp, adjunta tu comprobante de pago para procesarlo de inmediato.
                </Text>
              </View>
            )}
          </View>

          {/* SECCIÓN 5: HORA DE RECOLECCIÓN */}
          <View style={styles.contentCard}>
            <View style={styles.cardHeaderWithIcon}>
              <Text style={styles.cardHeaderIcon}>⏰</Text>
              <View>
                <Text style={styles.cardTitle}>Hora de Recolección</Text>
                <Text style={styles.cardSub}>Apartamos tu turno para que tu producto esté listo</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.timeSelectorTrigger, horaSeleccionada && styles.timeSelectorTriggerActive]}
              onPress={() => setModalHoraVisible(true)}
            >
              <View style={styles.timeSelectorTriggerLeft}>
                <Text style={styles.timeSelectorEmoji}>🕒</Text>
                <Text style={[styles.timeSelectorText, horaSeleccionada && styles.timeSelectorTextActive]}>
                  {horaSeleccionada ? `Hora Elegida: ${horaSeleccionada}` : 'Toca para elegir tu hora (Intervalos de 5 min)'}
                </Text>
              </View>
              <Text style={styles.timeSelectorArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* BOTÓN PRINCIPAL DE CONFIRMACIÓN */}
          <TouchableOpacity
            style={[
              styles.btnMainOrderSubmit,
              (!estaAbierto && !isAdmin) && styles.btnMainOrderSubmitDisabled
            ]}
            onPress={handleConfirmarPedido}
          >
            <Text style={styles.btnMainOrderSubmitText}>
              {estaAbierto
                ? 'Confirmar Pedido y Abrir WhatsApp 🚀'
                : 'Sucursal Cerrada por el Momento 🛑'}
            </Text>
            <Text style={styles.btnMainOrderSubmitSubtext}>
              {estaAbierto
                ? 'Genera tu ticket digital y envía el detalle al instante'
                : 'Consulta nuestros horarios de atención'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* =========================================================================
          MODAL 1: TICKET DIGITAL Y ENVÍO A WHATSAPP (SOLUCIÓN DEFINITIVA WEB/PWA)
         ========================================================================= */}
      <Modal visible={modalTicketVisible} animationType="slide" transparent={true}>
        <View style={styles.modalBackdrop}>
          <View style={styles.ticketModalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* TICKET DIGITAL CON DISEÑO FORMAL DE COMPROBANTE */}
              <View style={styles.digitalTicketReceipt}>
                <View style={styles.ticketTopHeader}>
                  <Text style={styles.ticketLogoEmoji}>🐟</Text>
                  <Text style={styles.ticketStoreName}>PESCADERÍA BATEQUIS</Text>
                  <Text style={styles.ticketSubStore}>COMPROBANTE Y TICKET DIGITAL</Text>
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
                {ticketActual?.telefono ? (
                  <View style={styles.ticketDataRow}>
                    <Text style={styles.ticketDataLabel}>Teléfono:</Text>
                    <Text style={styles.ticketDataValue}>{ticketActual?.telefono}</Text>
                  </View>
                ) : null}
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
                  ¡Gracias por tu preferencia! Confirma por WhatsApp para procesar tu pedido de inmediato.
                </Text>
              </View>

              {/* BOTONES DE ACCIÓN (WHATSAPP DIRECTO + COPIAR) */}
              <View style={styles.ticketActionsContainer}>
                {/* BOTÓN PRIMARIO: ENVIAR POR WHATSAPP (ACCION DIRECTA DE CLIC) */}
                <TouchableOpacity
                  style={styles.btnActionWhatsAppPrimary}
                  onPress={() => abrirWhatsAppConMensaje(ticketActual?.urlWhatsApp)}
                >
                  <Text style={styles.btnActionWhatsAppPrimaryText}>
                    📲 Enviar Pedido a WhatsApp
                  </Text>
                  <Text style={styles.btnActionWhatsAppPrimarySub}>
                    Se abrirá la conversación con todos tus datos
                  </Text>
                </TouchableOpacity>

                {/* BOTÓN SECUNDARIO: COPIAR DETALLES */}
                <TouchableOpacity
                  style={styles.btnActionCopyDetails}
                  onPress={() => copiarAlPortapapeles(ticketActual?.mensajeCompleto, 'Resumen del pedido copiado')}
                >
                  <Text style={styles.btnActionCopyDetailsText}>
                    📋 {copiadoFeedback ? '¡Copiado con Éxito!' : 'Copiar Texto del Pedido'}
                  </Text>
                </TouchableOpacity>

                {/* FINALIZAR Y CERRAR */}
                <TouchableOpacity
                  style={styles.btnCloseTicketModal}
                  onPress={() => setModalTicketVisible(false)}
                >
                  <Text style={styles.btnCloseTicketModalText}>Finalizar y Volver al Menú</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* =========================================================================
          MODAL 2: SELECTOR DE HORA (INTERVALOS DE 5 MINUTOS)
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
            <Text style={styles.modalDialogSub}>Turnos de preparación cada 5 minutos</Text>

            {/* SELECCIÓN DE HORA BASE */}
            <Text style={styles.stepSubtitle}>1. Elige la Hora:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalHoursScroll}>
              {HORAS_JORNADA.map((item) => {
                const esActiva = horaBloqueActivo.horaStr === item.horaStr;
                return (
                  <TouchableOpacity
                    key={item.horaStr}
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

            {/* SELECCIÓN DE MINUTOS */}
            <Text style={styles.stepSubtitle}>
              2. Minutos para las {horaBloqueActivo.horaStr} {horaBloqueActivo.ampm}:
            </Text>
            <View style={styles.minutesGrid}>
              {MINUTOS_INTERVALOS.map((min) => {
                const horaStringCompleta = `${horaBloqueActivo.horaStr}:${min} ${horaBloqueActivo.ampm}`;
                const estaOcupado = listaHorasOcupadas.includes(horaStringCompleta);
                const estaSeleccionado = horaSeleccionada === horaStringCompleta;

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
                        styles.minuteBtnText,
                        estaOcupado && styles.minuteBtnTextOccupied,
                        estaSeleccionado && styles.minuteBtnTextSelected
                      ]}
                    >
                      {estaOcupado ? 'OCUPADO' : `:${min}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.btnSecondaryCancel}
              onPress={() => setModalHoraVisible(false)}
            >
              <Text style={styles.btnSecondaryCancelText}>Cerrar sin Cambios</Text>
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
              {['Kg', 'Gramos', 'Pesos'].map((unid) => (
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
              <Text style={styles.inputLabel}>Unidad Principal</Text>
              <TextInput
                style={styles.textInputModern}
                placeholder="Ej. Kg, Pieza"
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
          MODAL 8: EDITAR DATOS BANCARIOS (ADMIN)
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

            <TextInput
              style={[styles.textInputModern, { height: 110, textAlignVertical: 'top' }]}
              multiline
              placeholder="Banco, Tarjeta, CLABE, Titular..."
              placeholderTextColor="#94a3b8"
              value={nuevoBancoInput}
              onChangeText={setNuevoBancoInput}
            />

            <TouchableOpacity style={styles.btnModalPrimary} onPress={handleGuardarBanco}>
              <Text style={styles.btnModalPrimaryText}>Guardar Información</Text>
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
          MODAL 11: AVISO / ALERTA INTEGRADA (COMPATIBLE CON WEB, PWA Y NATIVE)
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
    backgroundColor: '#0369a1',
  },
  appContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    backgroundColor: '#f8fafc',
  },

  // --- HEADER PREMIUM ---
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0369a1',
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogoBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerLogoIcon: {
    fontSize: 24,
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
    marginBottom: 8,
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

  // --- TARJETAS DE CONTENIDO COMUNES ---
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
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
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

  // --- PRODUCTOS ---
  productCardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
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
    fontSize: 14,
    fontWeight: '800',
    color: '#0284c7',
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
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnAddProductBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
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
  bankInfoContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bankInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  bankInfoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  btnCopyBank: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  btnCopyBankText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  bankInfoText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 6,
  },
  bankInfoNote: {
    fontSize: 11,
    color: '#64748b',
    fontStyle: 'italic',
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
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
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
  },
  ticketTopHeader: {
    alignItems: 'center',
    marginBottom: 10,
  },
  ticketLogoEmoji: {
    fontSize: 32,
    marginBottom: 4,
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
  btnActionWhatsAppPrimary: {
    backgroundColor: '#25D366',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  btnActionWhatsAppPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  btnActionWhatsAppPrimarySub: {
    color: '#f0fdf4',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  btnActionCopyDetails: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  btnActionCopyDetailsText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  btnCloseTicketModal: {
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 6,
  },
  btnCloseTicketModalText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },

  // --- MODAL SELECTOR DE TIEMPO ---
  timePickerModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
  },
  stepSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginTop: 8,
    marginBottom: 6,
  },
  horizontalHoursScroll: {
    maxHeight: 52,
    marginBottom: 10,
  },
  hourPill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
  },
  hourPillActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  hourPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  hourPillTextActive: {
    color: '#ffffff',
  },
  minutesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  minuteBtn: {
    width: '23%',
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    marginBottom: 8,
  },
  minuteBtnOccupied: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  minuteBtnSelected: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  minuteBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  minuteBtnTextOccupied: {
    color: '#ef4444',
    fontSize: 9,
    fontWeight: '800',
  },
  minuteBtnTextSelected: {
    color: '#15803d',
    fontWeight: '800',
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