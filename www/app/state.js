        let usuariosSinRetornoGlobal = [];
        let usuariosFansGlobal = [];
        let usuariosMutuosGlobal = [];
        let categoriaActual = 'noteSiguen';
        let ordenAscendente = true;

        let usarModoZip = true;
        let zipFollowersArray = [];
        let zipFollowingArray = [];
        let zipAviso = '';
        let zipPerfil = null;

        function ajustarAltoCabecera() {
            const h = document.querySelector('.header-minimal');
            if (h) document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
        }
        window.addEventListener('resize', ajustarAltoCabecera);
        window.addEventListener('load', ajustarAltoCabecera);

        function borrarTodo() {
            if (!confirm(t('Se borrarán los análisis cargados, el historial, las descargas guardadas, la limpieza guiada y las marcas de este dispositivo. ¿Continuar?'))) return;
            ['golifiar-history', 'golifiar-snapshots', 'golifiar-limpieza', CLAVE_NO_DISP].forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } });
            noDisponibles = new Set();
            usuariosSinRetornoGlobal = []; usuariosFansGlobal = []; usuariosMutuosGlobal = [];
            zipFollowersArray = []; zipFollowingArray = []; zipPerfil = null;
            ['zipFileInput', 'followersFile', 'followingFile'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            if (window.Perfil) window.Perfil.render(null, [], []);
            document.getElementById('resultsSection').classList.add('hidden');
            const hp = document.getElementById('historyPanel'); if (hp) hp.classList.add('hidden');
            const tag = document.getElementById('tagZip'); if (tag) { tag.classList.remove('active'); tag.innerText = t('Ningún archivo ZIP seleccionado'); }
            mostrarEstado('', '');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            mostrarToast(t('Datos borrados de este dispositivo.'));
        }

        function trigHaptic(duration = 35) {
            if (navigator.vibrate) {
                try { navigator.vibrate(duration); } catch(e) {}
            }
        }

        function mostrarEstado(message, kind = '') {
            const status = document.getElementById('uploadStatus');
            if (status) {
                status.textContent = message;
                status.className = `status-message ${kind}`.trim();
            }
        }

        function mostrarToast(message) {
            const toast = document.getElementById('toast');
            if (!toast) return;
            toast.textContent = message;
            toast.classList.add('visible');
            window.clearTimeout(window.toastTimer);
            window.toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3200);
        }

        function mostrarAyudaDescarga() {
            const dialog = document.getElementById('downloadHelpDialog');
            if (dialog?.showModal) dialog.showModal();
        }

        function cerrarAyudaDescarga() {
            document.getElementById('downloadHelpDialog')?.close();
        }

        function temaActual() {
            const forzado = document.documentElement.getAttribute('data-theme');
            if (forzado === 'dark' || forzado === 'light') return forzado;
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        function pintarTema(t) {
            const meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', t === 'dark' ? '#0a1a24' : '#0b6e99');
            const b = document.getElementById('themeToggle');
            if (b) {
                const etiqueta = t === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
                b.setAttribute('aria-label', etiqueta); b.setAttribute('title', etiqueta);
            }
        }
        function alternarTema() {
            const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', nuevo);
            pintarTema(nuevo);
            try { localStorage.setItem('golifiar-tema', nuevo); } catch (e) { /* sin almacenamiento */ }
        }
        pintarTema(temaActual());

        function cambiarVista(vista) {
            trigHaptic(30);
            document.body.dataset.modulo = vista;
            const vistas = ['viewInicio', 'viewAuditoria', 'viewWhatsapp', 'viewTikTok', 'viewSpotify', 'viewComoUsar', 'viewQuienSoy', 'viewPrivacidad', 'viewTransparencia', 'viewDocumentacion'];
            vistas.forEach(v => {
                const el = document.getElementById(v);
                if (el) el.classList.add('hidden');
            });

            ['navInicio', 'navAuditoria', 'navWhatsapp', 'navTikTok', 'navSpotify', 'navComoUsar', 'navQuienSoy'].forEach(n => {
                const el = document.getElementById(n);
                if (el) el.classList.remove('active');
            });

            if (vista === 'inicio') {
                document.getElementById('viewInicio').classList.remove('hidden');
                const nav = document.getElementById('navInicio');
                if (nav) nav.classList.add('active');
            } else if (vista === 'auditoria') {
                document.getElementById('viewAuditoria').classList.remove('hidden');
                const nav = document.getElementById('navAuditoria');
                if (nav) nav.classList.add('active');
            } else if (vista === 'whatsapp') {
                document.getElementById('viewWhatsapp').classList.remove('hidden');
                const nav = document.getElementById('navWhatsapp');
                if (nav) nav.classList.add('active');
            } else if (vista === 'tiktok') {
                document.getElementById('viewTikTok').classList.remove('hidden');
                const nav = document.getElementById('navTikTok');
                if (nav) nav.classList.add('active');
            } else if (vista === 'spotify') {
                document.getElementById('viewSpotify').classList.remove('hidden');
                const nav = document.getElementById('navSpotify');
                if (nav) nav.classList.add('active');
            } else if (vista === 'comousar') {
                document.getElementById('viewComoUsar').classList.remove('hidden');
                const nav = document.getElementById('navComoUsar');
                if (nav) nav.classList.add('active');
            } else if (vista === 'quiensoy') {
                document.getElementById('viewQuienSoy').classList.remove('hidden');
                const nav = document.getElementById('navQuienSoy');
                if (nav) nav.classList.add('active');
            } else if (vista === 'privacidad') {
                document.getElementById('viewPrivacidad').classList.remove('hidden');
            } else if (vista === 'transparencia') {
                document.getElementById('viewTransparencia').classList.remove('hidden');
            } else if (vista === 'documentacion') {
                document.getElementById('viewDocumentacion').classList.remove('hidden');
            }
            const visible = document.querySelector('.view-container:not(.hidden)');
            if (visible) { visible.classList.remove('view-enter'); void visible.offsetWidth; visible.classList.add('view-enter'); }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function abrirLegal() {
            const modal = document.getElementById('legalModal');
            if (modal && modal.showModal) modal.showModal();
        }

        function cerrarLegal() {
            const modal = document.getElementById('legalModal');
            if (modal && modal.close) modal.close();
        }
