# Matriz de validación Fedora/KDE real

Estado: **bloqueada hasta disponer de hardware Fedora/Plasma real**. No sustituye el CI de contenedor `fedora:latest`.

## Entorno a registrar

| Campo | Valor |
|---|---|
| Fecha | pendiente |
| Fedora versión (`cat /etc/fedora-release`) | pendiente |
| Plasma versión (`plasmashell --version`) | pendiente |
| Sesión (`echo $XDG_SESSION_TYPE`) | wayland / x11 |
| Electron/DSH_F versión | pendiente |
| Hardware/GPU | pendiente |
| Instalación previa | limpia / upgrade desde versión X |

## Checklist

- [ ] Instalar RPM y validar `desktop-file-validate`.
- [ ] Abrir proyecto real y crear sesión sin credenciales sensibles en capturas.
- [ ] Bandeja StatusNotifier: mostrar/ocultar, cerrar a bandeja, salir.
- [ ] Sin bandeja disponible: degradación a ventana normal y log de aviso.
- [ ] Autostart XDG: crear/desactivar lanzador y comprobar inicio de sesión.
- [ ] Suspensión/reanudación: motor no queda huérfano; puente sigue o se recupera.
- [ ] Notificaciones nativas: listo/error, silenciables, sin rutas/secretos.
- [ ] Tema sistema/claro/oscuro con Plasma.
- [ ] Upgrade RPM: conservar `userData`, `DSH_HOME`, proyectos y preferencias.
- [ ] Rollback documentado a versión anterior.
- [ ] Accesibilidad manual: lector de pantalla, zoom 200 %, alto contraste (subfase 1.8).

## Resultado

No marcar Hecho hasta adjuntar versión/sesión/hardware, fallos conocidos y evidencia (logs redactados o capturas sin secretos). El contenedor Fedora del CI valida instalación/dependencias, no Plasma real.
