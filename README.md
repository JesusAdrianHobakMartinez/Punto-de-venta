# La Esquinita

Sistema de punto de venta multiplataforma para pequeñas tiendas. Permite administrar inventario, registrar ventas, controlar turnos y cortes de caja, sincronizar datos por la red local y utilizar la misma interfaz en Windows, Android e iOS.

[![Angular](https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white)](https://angular.dev/)
[![Electron](https://img.shields.io/badge/Electron-45-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)

## Funcionalidades

- Catálogo de productos organizado por categorías.
- Códigos de barras compatibles con lectores USB.
- Ventas en efectivo y con tarjeta.
- Recargas telefónicas dentro del ticket.
- Inventario y control de existencias.
- Usuarios con permisos de administrador y empleado.
- Apertura de turno con fondo inicial.
- Corte de caja con conteo de efectivo y comprobantes.
- Historial de ventas, turnos y diferencias.
- Exportación e importación de productos en CSV compatible con Excel.
- Eliminación controlada de ventas con restauración de existencias.
- Solicitudes de eliminación y permisos editables.
- Sincronización local entre computadora y dispositivos móviles.
- Aplicación de escritorio para Windows.

## Tecnología

- Angular 22
- TypeScript
- Electron
- Capacitor
- Android Studio / Gradle
- Xcode para iOS
- Node.js

## Arquitectura

La interfaz se desarrolla con Angular y se empaqueta de tres formas:

- **Windows:** Angular dentro de una aplicación Electron.
- **Android:** Angular mediante Capacitor.
- **iOS:** Angular mediante Capacitor.

La computadora que ejecuta la aplicación de escritorio funciona como servidor local. Los teléfonos sincronizan productos, ventas, usuarios, categorías y cortes cada pocos segundos.

El servidor conserva cambios pendientes cuando un dispositivo se desconecta y permite reintentarlos al recuperar la conexión. Si dos dispositivos editan una versión desactualizada, el servidor rechaza el cambio para evitar sobrescrituras.

## Seguridad y red local

- No se incluyen credenciales predeterminadas.
- Se crea una cuenta de administrador durante el primer inicio.
- La sincronización usa una clave compartida y HTTP dentro de la red local.
- Debe utilizarse únicamente en una red Wi-Fi privada y de confianza.
- Las contraseñas de perfiles forman parte de los datos sincronizados.
- No conectes el servidor a una red pública.

## Requisitos

- Node.js y npm.
- Windows para generar el instalador de escritorio.
- Android Studio y Android SDK para Android.
- macOS con Xcode para iOS.

## Requisitos

- Node.js y npm
- Windows para generar el instalador de escritorio
- Android Studio y Android SDK para compilar e instalar la aplicación Android
- macOS con Xcode para compilar la aplicación iOS

## Iniciar en desarrollo

```powershell
npm.cmd install
npm.cmd start
```

Para abrir la aplicación como ventana de escritorio:

```powershell
npm.cmd run desktop:dev
```

## Generar instalador de Windows

```powershell
npm.cmd run desktop:dist
```

El instalador NSIS se genera dentro de `release/`.

## Aplicación móvil

La app móvil se genera con Capacitor y comparte la interfaz de Angular:

```powershell
npm.cmd run mobile:apk
npm.cmd run mobile:android
```

El APK de depuración se genera en `android\app\build\outputs\apk\debug\app-debug.apk`. Para instalarlo por USB con Android Debug Bridge, activa la depuración USB y ejecuta `adb install android\app\build\outputs\apk\debug\app-debug.apk`. También puedes abrir Android Studio y generar el APK desde **Build > Build APK(s)**. Para crear una versión iOS:

```sh
npm run mobile:sync
npm run mobile:ios
```

La compilación de iOS requiere macOS y Xcode; no se puede generar desde Windows. Publicar en Google Play o App Store requiere firmar la aplicación y configurar las cuentas de desarrollador correspondientes.

Para vincular un teléfono:

1. Abre la app de escritorio y entra como administrador.
2. Abre **Conexión móvil** y copia la dirección y clave que aparecen.
3. En la app móvil, introduce ambos valores y pulsa **Conectar con la tienda**.
4. Mantén la computadora encendida y conecta todos los dispositivos a la misma red Wi-Fi privada. Permite el puerto `43827` en Windows Firewall para redes privadas si se solicita.

La conexión local usa HTTP y no cifra el tráfico. La clave es compartida y autoriza acceso al conjunto de datos; todavía no hay autorización por usuario en el servidor, y las contraseñas de perfiles forman parte de los datos sincronizados. Vincula solo teléfonos de confianza en una red Wi-Fi privada; no compartas la clave ni conectes la aplicación a redes públicas. La sincronización requiere que la aplicación de escritorio esté abierta.

## Primer inicio

Al abrir la aplicación de escritorio por primera vez, crea el nombre de usuario y la contraseña del administrador. No hay usuarios ni contraseñas predeterminados. Después, el administrador puede dar de alta perfiles para los empleados.

Si ya tenías una versión anterior instalada, al actualizar se quitarán las cuentas predeterminadas y se conservarán los productos, ventas y perfiles personalizados para que configures una nueva cuenta de administrador. Los datos compartidos se guardan en la computadora principal; la clave local autoriza la sincronización de los dispositivos emparejados.

## Validación

```powershell
npm.cmd test -- --watch=false
npm.cmd run test:sync
npm.cmd run build
```
