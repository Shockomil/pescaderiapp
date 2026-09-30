import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  Linking,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Importación de Firebase desde tu archivo de configuración
import { db, auth } from './firebaseConfig';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  addDoc
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

// Estructura para el selector desplegable de 5 minutos
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
  // --- ESTADOS DE AUTENTICACIÓN Y ROLES ---
  const [isAdmin, setIsAdmin] = useState(false);
  const [modalLoginVisible, setModalLoginVisible] = useState(false);
  const [emailAdmin, setEmailAdmin] = useState('');
  const [passwordAdmin, setPasswordAdmin] = useState('');

  // --- ESTADOS EN TIEMPO REAL (FIRESTORE) ---
  const [productos, setProductos] = useState([]);
  const [horariosOcupados, setHorariosOcupados] = useState([]);
  const [telefonoContacto, setTelefonoContacto] = useState('6681234567');
  const [datosBancarios, setDatosBancarios] = useState(
    'Banco: BBVA\nTarjeta: 1234 5678 9012 3456\nCLABE: 012180012345678901\nTitular: Pescadería Batequis'
  );
  const [urlUbicacion, setUrlUbicacion] = useState('https://maps.google.com');

  // Horario de atención configurable
  const [horaApertura, setHoraApertura] = useState(9); // 9 AM
  const [horaCierre, setHoraCierre] = useState(17);    // 5 PM
  const [modoForzadoEstado, setModoForzadoEstado] = useState('auto'); // 'auto', 'abierto', 'cerrado'
  const [estaAbierto, setEstaAbierto] = useState(true);

  // --- ESTADOS DE DATOS DEL COMPRADOR Y HISTORIAL ---
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [historialPedidos, setHistorialPedidos] = useState([]);

  // --- ESTADOS DEL CARRITO Y PAGO ---
  const [carrito, setCarrito] = useState([]);
  const [modalAgregarItem, setModalAgregarItem] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [cantidadInput, setCantidadInput] = useState('');
  const [unidadSeleccionada, setUnidadSeleccionada] = useState('Kg');
  const [metodoPago, setMetodoPago] = useState('efectivo');

  // --- ESTADOS DEL SELECTOR DESPLEGABLE DE HORA ---
  const [horaSeleccionada, setHoraSeleccionada] = useState(null);
  const [modalHoraVisible, setModalHoraVisible] = useState(false);
  const [horaBloqueActivo, setHoraBloqueActivo] = useState(HORAS_JORNADA[0]);

  // --- ESTADOS DE MODALES ADMIN ---
  const [modalNuevoProducto, setModalNuevoProducto] = useState(false);
  const [nombreNuevoProd, setNombreNuevoProd] = useState('');
  const [precioNuevoProd, setPrecioNuevoProd] = useState('');
  const [unidadNuevoProd, setUnidadNuevoProd] = useState('Kg');

  const [modalEditarTelefono, setModalEditarTelefono] = useState(false);
  const [nuevoTelefonoInput, setNuevoTelefonoInput] = useState('');

  const [modalEditarBanco, setModalEditarBanco] = useState(false);
  const [nuevoBancoInput, setNuevoBancoInput] = useState('');

  const [modalEditarUbicacion, setModalEditarUbicacion] = useState(false);
  const [nuevaUbicacionInput, setNuevaUbicacionInput] = useState('');

  const [modalEditarHorarios, setModalEditarHorarios] = useState(false);
  const [nuevaAperturaInput, setNuevaAperturaInput] = useState('9');
  const [nuevoCierreInput, setNuevoCierreInput] = useState('17');

  // 1. ESCUCHAR AUTENTICACIÓN ADMIN
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!user);
    });
    return () => unsubscribeAuth();
  }, []);

  // 2. ESCUCHAR CATÁLOGO DE PRODUCTOS
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

  // 3. ESCUCHAR HORARIOS OCUPADOS EN TIEMPO REAL
  useEffect(() => {
    const unsubscribeHorarios = onSnapshot(collection(db, 'horarios_ocupados'), (snapshot) => {
      const listaHorarios = snapshot.docs.map((docSnap) => docSnap.data().hora);
      setHorariosOcupados(listaHorarios);
    });
    return () => unsubscribeHorarios();
  }, []);

  // 4. ESCUCHAR CONFIGURACIÓN (TELÉFONO, BANCO, UBICACIÓN, HORARIOS Y ESTADO)
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

  // 5. VALIDAR HORA Y ESTADO DEL NEGOCIO (AUTOMÁTICO VS FORZADO)
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
      // Modo Automático por hora del dispositivo
      const ahora = new Date();
      const horaActual = ahora.getHours();
      if (horaActual >= horaApertura && horaActual < horaCierre) {
        setEstaAbierto(true);
      } else {
        setEstaAbierto(false);
      }
    };
    evaluarEstadoNegocio();
    const intervalo = setInterval(evaluarEstadoNegocio, 30000); // Revisa cada 30 segundos
    return () => clearInterval(intervalo);
  }, [horaApertura, horaCierre, modoForzadoEstado]);

  // 6. CARGAR HISTORIAL DE PEDIDOS LOCALES (AsyncStorage)
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
      const actualizado = [nuevoPedido, ...historialPedidos].slice(0, 5); // Guardar los últimos 5
      setHistorialPedidos(actualizado);
      await AsyncStorage.setItem('@historial_pedidos', JSON.stringify(actualizado));
    } catch (e) {
      console.log('Error guardando en historial local', e);
    }
  };

  const handleRepetirPedido = (pedidoAnterior) => {
    setCarrito(pedidoAnterior.carrito);
    if (pedidoAnterior.nombreCliente) setNombreCliente(pedidoAnterior.nombreCliente);
    if (pedidoAnterior.telefonoCliente) setTelefonoCliente(pedidoAnterior.telefonoCliente);
    Alert.alert('¡Pedido Cargado!', 'Hemos cargado los productos de tu pedido anterior en el carrito.');
  };

  // --- LÓGICA DE SELECCIÓN DE PRODUCTOS Y CARRITO ---
  const abrirModalSeleccion = (producto) => {
    setProductoSeleccionado(producto);
    setCantidadInput('');
    setUnidadSeleccionada('Kg');
    setModalAgregarItem(true);
  };

  const calcularSubtotalItem = (precioBase, cantidad, unidad) => {
    const cant = parseFloat(cantidad) || 0;
    const prec = parseFloat(precioBase) || 0;
    if (unidad === 'Kg') return cant * prec;
    if (unidad === 'Gramos') return (cant / 1000) * prec;
    if (unidad === 'Pesos') return cant;
    return 0;
  };

  const handleAgregarAlCarrito = () => {
    const cant = parseFloat(cantidadInput);
    if (!cantidadInput || isNaN(cant) || cant <= 0) {
      Alert.alert('Cantidad Inválida', 'Ingresa una cantidad mayor a 0.');
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
    setCarrito(carrito.filter(item => item.idCarrito !== idCarrito));
  };

  const calcularTotalCarrito = () => {
    return carrito.reduce((acc, item) => acc + item.subtotal, 0);
  };

  // --- LÓGICA DE ADMINISTRADOR ---
  const handleLoginAdmin = async () => {
    if (!emailAdmin || !passwordAdmin) {
      Alert.alert('Error', 'Ingresa correo y contraseña.');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, emailAdmin, passwordAdmin);
      setModalLoginVisible(false);
      setEmailAdmin('');
      setPasswordAdmin('');
      Alert.alert('Acceso Autorizado', 'Bienvenido al Panel Admin');
    } catch (error) {
      Alert.alert('Error', 'Correo o contraseña incorrectos.');
    }
  };

  const handleLogoutAdmin = async () => {
    try {
      await signOut(auth);
      Alert.alert('Sesión Cerrada', 'Has vuelto al modo cliente.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo cerrar la sesión.');
    }
  };

  const toggleDisponibilidad = async (id, estadoActual) => {
    try {
      await updateDoc(doc(db, 'productos', id), {
        disponible: !estadoActual
      });
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar la disponibilidad.');
    }
  };

  const handleAgregarProducto = async () => {
    if (!nombreNuevoProd || !precioNuevoProd) {
      Alert.alert('Error', 'Ingresa el nombre y el precio.');
      return;
    }
    try {
      await addDoc(collection(db, 'productos'), {
        nombre: nombreNuevoProd,
        precio: parseFloat(precioNuevoProd),
        unidad: unidadNuevoProd,
        disponible: true
      });
      setNombreNuevoProd('');
      setPrecioNuevoProd('');
      setModalNuevoProducto(false);
      Alert.alert('Éxito', 'Producto registrado.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar el producto.');
    }
  };

  const handleGuardarTelefono = async () => {
    if (!nuevoTelefonoInput) {
      Alert.alert('Error', 'Ingresa un número válido.');
      return;
    }
    try {
      await setDoc(doc(db, 'configuracion', 'general'), {
        telefono: nuevoTelefonoInput
      }, { merge: true });
      setModalEditarTelefono(false);
      setNuevoTelefonoInput('');
      Alert.alert('Éxito', 'Teléfono actualizado.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar.');
    }
  };

  const handleGuardarBanco = async () => {
    if (!nuevoBancoInput) {
      Alert.alert('Error', 'Ingresa los datos bancarios.');
      return;
    }
    try {
      await setDoc(doc(db, 'configuracion', 'general'), {
        datosBancarios: nuevoBancoInput
      }, { merge: true });
      setModalEditarBanco(false);
      setNuevoBancoInput('');
      Alert.alert('Éxito', 'Datos bancarios actualizados.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar la información bancaria.');
    }
  };

  const handleGuardarUbicacion = async () => {
    if (!nuevaUbicacionInput) {
      Alert.alert('Error', 'Ingresa el enlace de Google Maps.');
      return;
    }
    try {
      await setDoc(doc(db, 'configuracion', 'general'), {
        urlUbicacion: nuevaUbicacionInput
      }, { merge: true });
      setModalEditarUbicacion(false);
      setNuevaUbicacionInput('');
      Alert.alert('Éxito', 'Enlace de ubicación actualizado.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar la ubicación.');
    }
  };

  const handleGuardarHorarios = async () => {
    const ap = parseInt(nuevaAperturaInput);
    const ci = parseInt(nuevoCierreInput);
    if (isNaN(ap) || isNaN(ci) || ap < 0 || ci > 24 || ap >= ci) {
      Alert.alert('Horario Inválido', 'Ingresa horas válidas en formato 24 horas (ej. Apertura 9, Cierre 17).');
      return;
    }
    try {
      await setDoc(doc(db, 'configuracion', 'general'), {
        horaApertura: ap,
        horaCierre: ci
      }, { merge: true });
      setModalEditarHorarios(false);
      Alert.alert('Éxito', 'Horario de atención actualizado.');
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar el horario.');
    }
  };

  const cambiarModoEstadoAdmin = async (nuevoModo) => {
    try {
      await setDoc(doc(db, 'configuracion', 'general'), {
        modoForzadoEstado: nuevoModo
      }, { merge: true });
      const nombresModo = {
        'auto': 'Modo Automático por Reloj',
        'abierto': 'Negocio Forzado a ABIERTO',
        'cerrado': 'Negocio Forzado a CERRADO'
      };
      Alert.alert('Estado Actualizado', `Ahora el negocio está en: ${nombresModo[nuevoModo]}`);
    } catch (error) {
      Alert.alert('Error', 'No se pudo cambiar el estado del negocio.');
    }
  };

  // --- CONFIRMAR PEDIDO Y ENVIAR POR WHATSAPP ---
  const handleConfirmarPedido = async () => {
    if (!estaAbierto && !isAdmin) {
      Alert.alert('Negocio Cerrado', `Actualmente estamos cerrados. Nuestro horario es de ${horaApertura}:00 hrs a ${horaCierre}:00 hrs.`);
      return;
    }
    if (!nombreCliente.trim()) {
      Alert.alert('Nombre Requerido', 'Por favor ingresa el nombre de la persona que recogerá el pedido.');
      return;
    }
    if (carrito.length === 0) {
      Alert.alert('Carrito Vacío', 'Agrega al menos un producto a tu pedido.');
      return;
    }
    if (!horaSeleccionada) {
      Alert.alert('Horario Requerido', 'Selecciona la hora en la que pasarás por tu pedido.');
      return;
    }
    try {
      // 1. Guardar y bloquear hora en Firestore
      await addDoc(collection(db, 'horarios_ocupados'), {
        hora: horaSeleccionada,
        cliente: nombreCliente.trim(),
        fechaRegistro: new Date().toISOString()
      });

      // 2. Guardar en el historial local del teléfono
      const registroLocal = {
        fecha: new Date().toLocaleDateString(),
        nombreCliente: nombreCliente.trim(),
        telefonoCliente: telefonoCliente.trim(),
        total: calcularTotalCarrito(),
        carrito: [...carrito]
      };
      await guardarPedidoEnHistorial(registroLocal);

      // 3. Construir mensaje
      const listaTexto = carrito.map(item => {
        const detalleCantidad = item.unidad === 'Pesos'
          ? `$${item.cantidad} MXN`
          : `${item.cantidad} ${item.unidad}`;
        return `• *${item.nombre}*: ${detalleCantidad} (Subtotal: $${item.subtotal.toFixed(2)})`;
      }).join('\n');

      const total = calcularTotalCarrito();
      const metodoPagoTexto = metodoPago === 'transferencia' ? '💳 Transferencia Bancaria' : '💵 Efectivo en Sucursal';
      const contactoTexto = telefonoCliente.trim() ? `\n📞 *TELÉFONO:* ${telefonoCliente.trim()}` : '';

      const mensaje = `¡Hola! Me gustaría hacer el siguiente pedido en *Pescadería Batequis*:\n\n` +
        `👤 *PERSONA QUE RECOGE:* ${nombreCliente.trim()}${contactoTexto}\n\n` +
        `🛒 *PRODUCTOS:*\n${listaTexto}\n\n` +
        `💰 *TOTAL ESTIMADO:* $${total.toFixed(2)} MXN\n` +
        `💳 *MÉTODO DE PAGO:* ${metodoPagoTexto}\n` +
        `⏰ *HORA DE RECOLECCIÓN:* ${horaSeleccionada}\n\n` +
        `¿Me confirman la recepción del pedido, por favor?`;

      const urlWhatsApp = `https://wa.me/52${telefonoContacto}?text=${encodeURIComponent(mensaje)}`;

      Alert.alert(
        '¡Pedido Reservado!',
        `A nombre de: ${nombreCliente.trim()}\nHora: ${horaSeleccionada}\n\nPresiona Enviar para mandar el pedido por WhatsApp.`,
        [
          {
            text: 'Enviar por WhatsApp 📲',
            onPress: () => {
              Linking.openURL(urlWhatsApp);
              setCarrito([]);
              setHoraSeleccionada(null);
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Ocurrió un problema al reservar la hora.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0284c7" />

      {/* ENCABEZADO */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Pescadería Batequis 🐟</Text>
          <Text style={styles.headerSubtitle}>Pedidos y Recolección</Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity style={styles.btnAdminLogout} onPress={handleLogoutAdmin}>
            <Text style={styles.btnTextSmall}>Salir Admin</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btnAdminLogin} onPress={() => setModalLoginVisible(true)}>
            <Text style={styles.btnTextSmall}>Admin 🔒</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* BARRA DE ESTADO DE ATENCIÓN (ABIERTO/CERRADO) Y UBICACIÓN */}
        <View style={styles.infoBanner}>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, { backgroundColor: estaAbierto ? '#22c55e' : '#ef4444' }]} />
            <Text style={styles.statusText}>
              {estaAbierto ? `ABIERTO (${horaApertura}:00 - ${horaCierre}:00 hrs)` : `CERRADO (Abre a las ${horaApertura}:00 hrs)`}
            </Text>
          </View>
          <TouchableOpacity style={styles.btnMaps} onPress={() => Linking.openURL(urlUbicacion)}>
            <Text style={styles.btnMapsText}>📍 Ver Maps</Text>
          </TouchableOpacity>
        </View>

        {/* BARRA DE ACCIONES DE ADMINISTRADOR */}
        {isAdmin && (
          <View style={styles.adminBar}>
            <Text style={styles.adminBarTitle}>⚙️ PANEL DE CONTROL ADMINISTRADOR</Text>

            <View style={styles.adminStatusControlBox}>
              <Text style={styles.adminLabelSmall}>Estado del Negocio:</Text>
              <View style={styles.adminStatusButtonsRow}>
                <TouchableOpacity
                  style={[styles.btnStatusOpt, modoForzadoEstado === 'abierto' && styles.btnStatusOptActiveGreen]}
                  onPress={() => cambiarModoEstadoAdmin('abierto')}
                >
                  <Text style={[styles.btnStatusOptText, modoForzadoEstado === 'abierto' && styles.textWhite]}>🟢 Forzar Abierto</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnStatusOpt, modoForzadoEstado === 'auto' && styles.btnStatusOptActiveBlue]}
                  onPress={() => cambiarModoEstadoAdmin('auto')}
                >
                  <Text style={[styles.btnStatusOptText, modoForzadoEstado === 'auto' && styles.textWhite]}>🕒 Automático</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnStatusOpt, modoForzadoEstado === 'cerrado' && styles.btnStatusOptActiveRed]}
                  onPress={() => cambiarModoEstadoAdmin('cerrado')}
                >
                  <Text style={[styles.btnStatusOptText, modoForzadoEstado === 'cerrado' && styles.textWhite]}>🛑 Forzar Cerrado</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.adminBarButtons}>
              <TouchableOpacity style={styles.btnAdminAction} onPress={() => setModalNuevoProducto(true)}>
                <Text style={styles.btnAdminActionText}>+ Prod</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnAdminAction}
                onPress={() => {
                  setNuevaAperturaInput(horaApertura.toString());
                  setNuevoCierreInput(horaCierre.toString());
                  setModalEditarHorarios(true);
                }}
              >
                <Text style={styles.btnAdminActionText}>⏰ Horario</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnAdminAction}
                onPress={() => {
                  setNuevoTelefonoInput(telefonoContacto);
                  setModalEditarTelefono(true);
                }}
              >
                <Text style={styles.btnAdminActionText}>📞 Tel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnAdminAction}
                onPress={() => {
                  setNuevoBancoInput(datosBancarios);
                  setModalEditarBanco(true);
                }}
              >
                <Text style={styles.btnAdminActionText}>💳 Banco</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnAdminAction}
                onPress={() => {
                  setNuevaUbicacionInput(urlUbicacion);
                  setModalEditarUbicacion(true);
                }}
              >
                <Text style={styles.btnAdminActionText}>📍 Maps</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* HISTORIAL Y REPETIR PEDIDO ANTERIOR */}
        {historialPedidos.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>📜 Tu Último Pedido</Text>
            <Text style={styles.sectionSub}>Fecha: {historialPedidos[0].fecha} - Total: ${historialPedidos[0].total.toFixed(2)} MXN</Text>
            <TouchableOpacity style={styles.btnRepetir} onPress={() => handleRepetirPedido(historialPedidos[0])}>
              <Text style={styles.btnRepetirText}>🔁 Repetir este Pedido en el Carrito</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* SECCIÓN 1: DATOS DE QUIEN RECOGE */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>👤 Datos de Quien Recoge</Text>
          <Text style={styles.sectionSub}>Ingresa los datos de la persona que pasará por el pedido:</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre Completo (Obligatorio) *"
            value={nombreCliente}
            onChangeText={setNombreCliente}
          />
          <TextInput
            style={[styles.input, { marginBottom: 0 }]}
            placeholder="Teléfono Celular (Opcional)"
            keyboardType="phone-pad"
            value={telefonoCliente}
            onChangeText={setTelefonoCliente}
          />
        </View>

        {/* SECCIÓN 2: CATÁLOGO DE PRODUCTOS */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>🛒 Menú de Hoy</Text>
          {productos.length === 0 ? (
            <Text style={styles.emptyText}>Cargando productos...</Text>
          ) : (
            productos.map((prod) => (
              <View key={prod.id} style={styles.productRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{prod.nombre}</Text>
                  <Text style={styles.productPrice}>
                    ${prod.precio} MXN / {prod.unidad || 'Kg'}
                  </Text>
                </View>
                {prod.disponible ? (
                  <TouchableOpacity style={styles.btnPedir} onPress={() => abrirModalSeleccion(prod)}>
                    <Text style={styles.btnPedirText}>➕ Pedir</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.badgeAgotado}>
                    <Text style={styles.badgeTextAgotado}>AGOTADO</Text>
                  </View>
                )}
                {isAdmin && (
                  <TouchableOpacity
                    style={[
                      styles.btnToggleAdmin,
                      { backgroundColor: prod.disponible ? '#ef4444' : '#22c55e' }
                    ]}
                    onPress={() => toggleDisponibilidad(prod.id, prod.disponible)}
                  >
                    <Text style={styles.btnTextSmall}>
                      {prod.disponible ? 'Agotar' : 'Activar'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>

        {/* SECCIÓN 3: DETALLE DEL CARRITO */}
        {carrito.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🛍️ Tu Pedido Selección</Text>
            {carrito.map((item) => (
              <View key={item.idCarrito} style={styles.cartRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartItemName}>{item.nombre}</Text>
                  <Text style={styles.cartItemDetails}>
                    {item.unidad === 'Pesos' ? `$${item.cantidad} MXN` : `${item.cantidad} ${item.unidad}`} ➔ Subtotal: ${item.subtotal.toFixed(2)} MXN
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleEliminarDelCarrito(item.idCarrito)}>
                  <Text style={styles.btnDelete}>❌</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Estimado:</Text>
              <Text style={styles.totalAmount}>${calcularTotalCarrito().toFixed(2)} MXN</Text>
            </View>
          </View>
        )}

        {/* SECCIÓN 4: MÉTODO DE PAGO Y DATOS BANCARIOS */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>💳 Forma de Pago</Text>
          <Text style={styles.sectionSub}>Selecciona cómo deseas realizar tu pago:</Text>
          <View style={styles.metodosPagoContainer}>
            <TouchableOpacity
              style={[styles.btnMetodoPago, metodoPago === 'efectivo' && styles.btnMetodoPagoActive]}
              onPress={() => setMetodoPago('efectivo')}
            >
              <Text style={[styles.metodoPagoText, metodoPago === 'efectivo' && styles.metodoPagoTextActive]}>
                💵 Efectivo en Sucursal
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnMetodoPago, metodoPago === 'transferencia' && styles.btnMetodoPagoActive]}
              onPress={() => setMetodoPago('transferencia')}
            >
              <Text style={[styles.metodoPagoText, metodoPago === 'transferencia' && styles.metodoPagoTextActive]}>
                💳 Transferencia Bancaria
              </Text>
            </TouchableOpacity>
          </View>

          {metodoPago === 'transferencia' && (
            <View style={styles.bankCard}>
              <Text style={styles.bankCardTitle}>🏦 Datos para Transferir:</Text>
              <Text style={styles.bankCardBody}>{datosBancarios}</Text>
              <Text style={styles.bankCardNote}>
                📌 Recuerda enviar tu comprobante de pago al confirmar el pedido por WhatsApp.
              </Text>
            </View>
          )}
        </View>

        {/* SECCIÓN 5: SELECTOR DESPLEGABLE DE HORA */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>⏰ Hora de Recolección</Text>
          <Text style={styles.sectionSub}>Toca la barra para desplegar el selector (intervalos de 5 minutos).</Text>
          <TouchableOpacity
            style={[styles.desplegableButton, horaSeleccionada && styles.desplegableButtonActive]}
            onPress={() => setModalHoraVisible(true)}
          >
            <Text style={[styles.desplegableText, horaSeleccionada && styles.desplegableTextActive]}>
              {horaSeleccionada ? `⏰ Hora elegida: ${horaSeleccionada}` : '👇 Seleccionar Hora de Recolección'}
            </Text>
            <Text style={styles.desplegableArrow}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* BOTÓN CONFIRMAR */}
        <TouchableOpacity
          style={[styles.btnConfirmar, !estaAbierto && !isAdmin && styles.btnConfirmarDisabled]}
          onPress={handleConfirmarPedido}
        >
          <Text style={styles.btnConfirmarText}>
            {estaAbierto ? 'Confirmar Pedido y Reservar Hora 🚀' : 'Cerrado por el Momento 🛑'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* --- MODAL SELECTOR DESPLEGABLE DE HORA --- */}
      <Modal visible={modalHoraVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentHora}>
            <Text style={styles.modalTitle}>Elige tu Hora de Recolección</Text>
            <Text style={styles.modalSub}>Intervalos disponibles cada 5 minutos</Text>
            <Text style={styles.labelSubSeccion}>1. Selecciona la Hora:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollHoras}>
              {HORAS_JORNADA.map((item) => {
                const esActiva = horaBloqueActivo.horaStr === item.horaStr;
                return (
                  <TouchableOpacity
                    key={item.horaStr}
                    style={[styles.chipHora, esActiva && styles.chipHoraActive]}
                    onPress={() => setHoraBloqueActivo(item)}
                  >
                    <Text style={[styles.chipHoraText, esActiva && styles.chipHoraTextActive]}>
                      {item.horaStr} {item.ampm}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={styles.labelSubSeccion}>2. Selecciona los Minutos ({horaBloqueActivo.horaStr} {horaBloqueActivo.ampm}):</Text>
            <View style={styles.gridMinutos}>
              {MINUTOS_INTERVALOS.map((min) => {
                const horaStringCompleta = `${horaBloqueActivo.horaStr}:${min} ${horaBloqueActivo.ampm}`;
                const estaOcupado = horariosOcupados.includes(horaStringCompleta);
                const estaSeleccionado = horaSeleccionada === horaStringCompleta;
                return (
                  <TouchableOpacity
                    key={min}
                    disabled={estaOcupado}
                    style={[
                      styles.btnMinuto,
                      estaOcupado && styles.btnMinutoOcupado,
                      estaSeleccionado && styles.btnMinutoSeleccionado
                    ]}
                    onPress={() => {
                      setHoraSeleccionada(horaStringCompleta);
                      setModalHoraVisible(false);
                    }}
                  >
                    <Text style={[
                      styles.btnMinutoText,
                      estaOcupado && styles.btnMinutoTextOcupado,
                      estaSeleccionado && styles.btnMinutoTextSeleccionado
                    ]}>
                      {estaOcupado ? 'OCUPADO' : `:${min}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.btnCerrarModalHora}
              onPress={() => setModalHoraVisible(false)}
            >
              <Text style={styles.btnSecondaryText}>Cerrar / Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL CANTIDAD (KG / GRAMOS / PESOS) --- */}
      <Modal visible={modalAgregarItem} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Agregar {productoSeleccionado?.nombre}
            </Text>
            <Text style={styles.modalSub}>
              Precio Base: ${productoSeleccionado?.precio} MXN / {productoSeleccionado?.unidad || 'Kg'}
            </Text>
            <Text style={styles.labelInput}>¿Cómo deseas pedirlo?</Text>
            <View style={styles.unitSelectorContainer}>
              {['Kg', 'Gramos', 'Pesos'].map((unid) => (
                <TouchableOpacity
                  key={unid}
                  style={[styles.unitTab, unidadSeleccionada === unid && styles.unitTabActive]}
                  onPress={() => {
                    setUnidadSeleccionada(unid);
                    setCantidadInput('');
                  }}
                >
                  <Text style={[styles.unitTabText, unidadSeleccionada === unid && styles.unitTabTextActive]}>
                    {unid === 'Pesos' ? 'En Pesos ($)' : unid}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder={
                unidadSeleccionada === 'Kg' ? 'Ejemplo: 1.5' :
                  unidadSeleccionada === 'Gramos' ? 'Ejemplo: 500' : 'Ejemplo: 200'
              }
              keyboardType="numeric"
              value={cantidadInput}
              onChangeText={setCantidadInput}
            />
            {cantidadInput !== '' && !isNaN(parseFloat(cantidadInput)) && (
              <View style={styles.subtotalPreview}>
                <Text style={styles.subtotalPreviewText}>
                  Subtotal: ${calcularSubtotalItem(productoSeleccionado?.precio, cantidadInput, unidadSeleccionada).toFixed(2)} MXN
                </Text>
              </View>
            )}
            <TouchableOpacity style={styles.btnPrimary} onPress={handleAgregarAlCarrito}>
              <Text style={styles.btnPrimaryText}>Añadir al Pedido</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalAgregarItem(false)}>
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL LOGIN ADMIN --- */}
      <Modal visible={modalLoginVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Acceso de Administración</Text>
            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
              value={emailAdmin}
              onChangeText={setEmailAdmin}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              secureTextEntry
              value={passwordAdmin}
              onChangeText={setPasswordAdmin}
            />
            <TouchableOpacity style={styles.btnPrimary} onPress={handleLoginAdmin}>
              <Text style={styles.btnPrimaryText}>Ingresar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalLoginVisible(false)}>
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL NUEVO PRODUCTO (ADMIN) --- */}
      <Modal visible={modalNuevoProducto} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Agregar Nuevo Producto</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre (ej. Camarón Mediano)"
              value={nombreNuevoProd}
              onChangeText={setNombreNuevoProd}
            />
            <TextInput
              style={styles.input}
              placeholder="Precio por Kg/Unidad MXN (ej. 220)"
              keyboardType="numeric"
              value={precioNuevoProd}
              onChangeText={setPrecioNuevoProd}
            />
            <TextInput
              style={styles.input}
              placeholder="Unidad (ej. Kg, Pieza)"
              value={unidadNuevoProd}
              onChangeText={setUnidadNuevoProd}
            />
            <TouchableOpacity style={styles.btnPrimary} onPress={handleAgregarProducto}>
              <Text style={styles.btnPrimaryText}>Guardar Producto</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalNuevoProducto(false)}>
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL EDITAR HORARIOS (ADMIN) --- */}
      <Modal visible={modalEditarHorarios} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Configurar Horario de Atención</Text>
            <Text style={styles.modalSub}>Formato de 24 horas (ej. 9 para las 9 AM, 17 para las 5 PM)</Text>
            <Text style={styles.labelInput}>Hora de Apertura (0 - 23):</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. 9"
              keyboardType="numeric"
              value={nuevaAperturaInput}
              onChangeText={setNuevaAperturaInput}
            />
            <Text style={styles.labelInput}>Hora de Cierre (0 - 23):</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. 17"
              keyboardType="numeric"
              value={nuevoCierreInput}
              onChangeText={setNuevoCierreInput}
            />
            <TouchableOpacity style={styles.btnPrimary} onPress={handleGuardarHorarios}>
              <Text style={styles.btnPrimaryText}>Guardar Horarios</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalEditarHorarios(false)}>
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL EDITAR TELÉFONO (ADMIN) --- */}
      <Modal visible={modalEditarTelefono} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar WhatsApp de Recepción</Text>
            <TextInput
              style={styles.input}
              placeholder="Número a 10 dígitos"
              keyboardType="phone-pad"
              value={nuevoTelefonoInput}
              onChangeText={setNuevoTelefonoInput}
            />
            <TouchableOpacity style={styles.btnPrimary} onPress={handleGuardarTelefono}>
              <Text style={styles.btnPrimaryText}>Guardar Teléfono</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalEditarTelefono(false)}>
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL EDITAR BANCO (ADMIN) --- */}
      <Modal visible={modalEditarBanco} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar Datos Bancarios</Text>
            <TextInput
              style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
              multiline
              placeholder="Banco, Tarjeta, CLABE..."
              value={nuevoBancoInput}
              onChangeText={setNuevoBancoInput}
            />
            <TouchableOpacity style={styles.btnPrimary} onPress={handleGuardarBanco}>
              <Text style={styles.btnPrimaryText}>Guardar Banco</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalEditarBanco(false)}>
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* --- MODAL EDITAR UBICACIÓN (ADMIN) --- */}
      <Modal visible={modalEditarUbicacion} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar Enlace de Google Maps</Text>
            <TextInput
              style={styles.input}
              placeholder="https://maps.google.com/..."
              value={nuevaUbicacionInput}
              onChangeText={setNuevaUbicacionInput}
            />
            <TouchableOpacity style={styles.btnPrimary} onPress={handleGuardarUbicacion}>
              <Text style={styles.btnPrimaryText}>Guardar Ubicación</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalEditarUbicacion(false)}>
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0284c7' },
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0284c7',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: '#e0f2fe' },
  btnAdminLogin: { backgroundColor: '#0369a1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  btnAdminLogout: { backgroundColor: '#dc2626', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  btnTextSmall: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  infoBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    elevation: 2,
  },
  statusContainer: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText: { fontSize: 13, fontWeight: 'bold', color: '#334155' },
  btnMaps: { backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  btnMapsText: { color: '#0369a1', fontSize: 12, fontWeight: 'bold' },
  adminBar: { backgroundColor: '#fef3c7', padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#f59e0b' },
  adminBarTitle: { fontSize: 13, fontWeight: 'bold', color: '#b45309', marginBottom: 8, textAlign: 'center' },
  adminStatusControlBox: { marginBottom: 10 },
  adminLabelSmall: { fontSize: 11, fontWeight: 'bold', color: '#78350f', marginBottom: 4 },
  adminStatusButtonsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  btnStatusOpt: { flex: 1, paddingVertical: 6, marginHorizontal: 2, backgroundColor: '#fff', borderRadius: 4, alignItems: 'center', borderWidth: 1, borderColor: '#d97706' },
  btnStatusOptActiveGreen: { backgroundColor: '#15803d', borderColor: '#15803d' },
  btnStatusOptActiveBlue: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  btnStatusOptActiveRed: { backgroundColor: '#b91c1c', borderColor: '#b91c1c' },
  btnStatusOptText: { fontSize: 10, fontWeight: 'bold', color: '#78350f' },
  textWhite: { color: '#fff' },
  adminBarButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  btnAdminAction: { backgroundColor: '#d97706', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 4, flex: 1, marginHorizontal: 2, alignItems: 'center' },
  btnAdminActionText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  sectionCard: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 16, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  sectionSub: { fontSize: 12, color: '#64748b', marginBottom: 12 },
  btnRepetir: { backgroundColor: '#e0e7ff', padding: 10, borderRadius: 6, alignItems: 'center', marginTop: 8 },
  btnRepetirText: { color: '#3730a3', fontSize: 13, fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: '#fff', marginBottom: 12 },
  emptyText: { color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: 10 },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  productName: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
  productPrice: { fontSize: 12, color: '#64748b' },
  btnPedir: { backgroundColor: '#0284c7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  btnPedirText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  badgeAgotado: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeTextAgotado: { color: '#94a3b8', fontSize: 10, fontWeight: 'bold' },
  btnToggleAdmin: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 4, marginLeft: 6 },
  cartRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  cartItemName: { fontSize: 13, fontWeight: 'bold', color: '#1e293b' },
  cartItemDetails: { fontSize: 12, color: '#64748b' },
  btnDelete: { fontSize: 14, padding: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  totalLabel: { fontSize: 14, fontWeight: 'bold', color: '#334155' },
  totalAmount: { fontSize: 16, fontWeight: 'bold', color: '#0284c7' },
  metodosPagoContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  btnMetodoPago: { flex: 1, padding: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, alignItems: 'center', marginHorizontal: 4 },
  btnMetodoPagoActive: { backgroundColor: '#e0f2fe', borderColor: '#0284c7' },
  metodoPagoText: { fontSize: 12, color: '#64748b', fontWeight: 'bold' },
  metodoPagoTextActive: { color: '#0284c7' },
  bankCard: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 8 },
  bankCardTitle: { fontSize: 12, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  bankCardBody: { fontSize: 12, color: '#334155', fontFamily: 'monospace', marginBottom: 6 },
  bankCardNote: { fontSize: 11, color: '#64748b', fontStyle: 'italic' },
  desplegableButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, padding: 12, backgroundColor: '#fff' },
  desplegableButtonActive: { borderColor: '#0284c7', backgroundColor: '#e0f2fe' },
  desplegableText: { fontSize: 13, color: '#64748b', fontWeight: 'bold' },
  desplegableTextActive: { color: '#0284c7' },
  desplegableArrow: { fontSize: 12, color: '#64748b' },
  btnConfirmar: { backgroundColor: '#22c55e', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 8, elevation: 3 },
  btnConfirmarDisabled: { backgroundColor: '#94a3b8' },
  btnConfirmarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, elevation: 5 },
  modalContentHora: { backgroundColor: '#fff', borderRadius: 12, padding: 16, maxHeight: '85%', elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 4, textAlign: 'center' },
  modalSub: { fontSize: 12, color: '#64748b', marginBottom: 14, textAlign: 'center' },
  labelSubSeccion: { fontSize: 12, fontWeight: 'bold', color: '#334155', marginTop: 10, marginBottom: 6 },
  scrollHoras: { maxHeight: 50, marginBottom: 10 },
  chipHora: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f1f5f9', borderRadius: 6, marginRight: 6, borderWidth: 1, borderColor: '#e2e8f0', justifyContent: 'center' },
  chipHoraActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  chipHoraText: { fontSize: 12, fontWeight: 'bold', color: '#334155' },
  chipHoraTextActive: { color: '#fff' },
  gridMinutos: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  btnMinuto: { width: '23%', paddingVertical: 10, backgroundColor: '#f8fafc', borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', marginBottom: 8 },
  btnMinutoOcupado: { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
  btnMinutoSeleccionado: { backgroundColor: '#dcfce7', borderColor: '#22c55e' },
  btnMinutoText: { fontSize: 13, fontWeight: 'bold', color: '#334155' },
  btnMinutoTextOcupado: { color: '#ef4444', fontSize: 10 },
  btnMinutoTextSeleccionado: { color: '#15803d' },
  btnCerrarModalHora: { marginTop: 10, padding: 10, alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 6 },
  labelInput: { fontSize: 12, fontWeight: 'bold', color: '#334155', marginBottom: 6 },
  unitSelectorContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  unitTab: { flex: 1, paddingVertical: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, alignItems: 'center', marginHorizontal: 2 },
  unitTabActive: { backgroundColor: '#e0f2fe', borderColor: '#0284c7' },
  unitTabText: { fontSize: 12, color: '#64748b', fontWeight: 'bold' },
  unitTabTextActive: { color: '#0284c7' },
  subtotalPreview: { backgroundColor: '#f0fdf4', padding: 8, borderRadius: 6, marginBottom: 12, borderWidth: 1, borderColor: '#bbf7d0', alignItems: 'center' },
  subtotalPreviewText: { color: '#15803d', fontSize: 13, fontWeight: 'bold' },
  btnPrimary: { backgroundColor: '#0284c7', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 6, marginBottom: 6 },
  btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  btnSecondaryText: { color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 6, fontWeight: 'bold' }
});