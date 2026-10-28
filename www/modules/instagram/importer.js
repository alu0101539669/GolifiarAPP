        function cambiarModoUpload(modo) {
            trigHaptic(25);
            const btnZip = document.querySelectorAll('.tab-btn')[0];
            const btnManual = document.querySelectorAll('.tab-btn')[1];
            const contentZip = document.getElementById('uploadModeZip');
            const contentManual = document.getElementById('uploadModeManual');

            if (modo === 'zip') {
                usarModoZip = true;
                btnZip.classList.add('active');
                btnManual.classList.remove('active');
                contentZip.classList.remove('hidden');
                contentManual.classList.add('hidden');
            } else {
                usarModoZip = false;
                btnManual.classList.add('active');
                btnZip.classList.remove('active');
                contentManual.classList.remove('hidden');
                contentZip.classList.add('hidden');
            }
        }

        function actualizarEstadoDropzone(tipo) {
            trigHaptic(25);
            if (tipo === 'followers') {
                const files = document.getElementById('followersFile').files;
                const tag = document.getElementById('tagFollowers');
                if (files.length > 0) {
                    tag.innerText = t('{n} archivo(s) listo(s)', { n: files.length });
                    tag.classList.add('active');
                } else {
                    tag.classList.remove('active');
                }
            } else if (tipo === 'following') {
                const file = document.getElementById('followingFile').files[0];
                const tag = document.getElementById('tagFollowing');
                if (file) {
                    tag.innerText = t('Archivo listo');
                    tag.classList.add('active');
                } else {
                    tag.classList.remove('active');
                }
            }
        }

        // Abre un ZIP leyendo solo su índice; cada entrada se descomprime bajo demanda.
        // Así un ZIP de varios GB con fotos y vídeos no llena la memoria.
        async function abrirZip(file) {
            if (window.zip && window.zip.ZipReader) {
                window.zip.configure({ useWebWorkers: false }); // sin workers: es la configuración que funciona sin servidor ni CSP especiales
                const lector = new window.zip.ZipReader(new window.zip.BlobReader(file));
                const todas = await lector.getEntries();
                return {
                    entradas: todas.filter(e => !e.directory).map(e => ({ ruta: e.filename, texto: () => e.getData(new window.zip.TextWriter()) })),
                    cerrar: () => lector.close().catch(() => {})
                };
            }
            const z = await new JSZip().loadAsync(file);
            const entradas = [];
            z.forEach((ruta, ent) => { if (!ent.dir) entradas.push({ ruta, texto: () => ent.async('string') }); });
            return { entradas, cerrar: () => Promise.resolve() };
        }

        function procesarZipAutomatico(input) {
            return procesarArchivosZip(Array.from(input.files || []), input);
        }

        // Devuelve true si el ZIP contiene algo que analizar
        async function procesarArchivosZip(files, input) {
            trigHaptic(30);
            const limpiarInput = () => { if (input) input.value = ''; };
            const tag = document.getElementById('tagZip');
            const progressContainer = document.getElementById('zipProgressBar');
            const progressFill = document.getElementById('zipProgressFill');

            if (!files.length) return false;

            // El motivo del rechazo se muestra dentro de la zona de carga, con el nombre del archivo
            const rechazar = texto => {
                limpiarInput();
                tag.innerText = texto;
                tag.classList.add('active');
                tag.style.color = 'var(--accent-rose)';
                mostrarEstado(texto, 'error');
                return false;
            };
            const tam = f => f.size >= 1073741824 ? (f.size / 1073741824).toFixed(1) + ' GB' : (f.size / 1048576).toFixed(1) + ' MB';
            const incompleto = files.find(f => /\.(crdownload|part|tmp|download|partial)$/i.test(f.name));
            if (incompleto) return rechazar(t('«{nombre}» es una descarga sin terminar. Espera a que acabe y vuelve a elegirla.', { nombre: incompleto.name }));
            const noZip = files.find(f => !f.name.toLowerCase().endsWith('.zip'));
            if (noZip) return rechazar(t('«{nombre}» no es un archivo .zip. Sube el ZIP tal como lo descargaste de Instagram, sin descomprimirlo.', { nombre: noZip.name }));
            const vacio = files.find(f => f.size === 0);
            if (vacio) return rechazar(t('«{nombre}» está vacío (0 bytes). Vuelve a descargarlo desde el correo de Instagram.', { nombre: vacio.name }));

            const totalMb = files.reduce((n, f) => n + f.size, 0) / (1024 * 1024);
            progressContainer.classList.add('active');
            progressFill.style.width = '10%';
            tag.innerText = t('Leyendo {que} ({tam})...', { que: files.length > 1 ? t('{n} archivos ZIP', { n: files.length }) : '«' + files[0].name + '»', tam: totalMb >= 1024 ? I18n.num((totalMb / 1024).toFixed(1)) + ' GB' : I18n.num(totalMb.toFixed(1)) + ' MB' });
            tag.classList.add('active');
            tag.style.color = 'var(--accent-blue)';
            mostrarEstado(t('Leyendo el archivo localmente. No cierres esta ventana.'), '');

            try {
                zipFollowersArray = [];
                zipFollowingArray = [];
                zipPerfil = window.Perfil ? window.Perfil.nuevo() : null;
                let nJson = 0, nHtml = 0;
                const listasPorZip = [];

                for (let i = 0; i < files.length; i++) {
                    const lista = { nombre: files[i].name, seg: [], sig: [] };
                    listasPorZip.push(lista);
                    const abierto = await abrirZip(files[i]);
                    const entries = [];
                    abierto.entradas.forEach(ent => {
                        const low = ent.ruta.toLowerCase();
                        if (low.endsWith('.json') || low.endsWith('.html') || low.endsWith('.htm')) entries.push({ relativePath: ent.ruta, zipEntry: ent });
                    });

                    let hechos = 0;
                    for (const { relativePath, zipEntry } of entries) {
                        const low = relativePath.toLowerCase();
                        const fileName = low.split('/').pop();
                        const esHtml = !low.endsWith('.json');
                        try {
                            if (esHtml) {
                                if (/^followers(_\d+)?\.html?$/.test(fileName)) {
                                    lista.seg = lista.seg.concat(extraerUsuariosHtml(await zipEntry.texto()));
                                    nHtml++;
                                } else if (/^following\.html?$/.test(fileName)) {
                                    lista.sig = lista.sig.concat(extraerUsuariosHtml(await zipEntry.texto()));
                                    nHtml++;
                                } else if (zipPerfil) {
                                    const tipo = window.Perfil.tipoHtml(relativePath);
                                    if (tipo === 'lista') window.Perfil.procesarHtml(relativePath, await zipEntry.texto(), zipPerfil);
                                    else if (tipo === 'solojson') zipPerfil.htmlOmitidos++;
                                }
                            } else {
                                const json = JSON.parse(await zipEntry.texto());
                                if (/^followers(_\d+)?\.json$/.test(fileName)) {
                                    lista.seg = lista.seg.concat(extraerUsuarios(json));
                                    nJson++;
                                } else if (fileName === 'following.json') {
                                    lista.sig = lista.sig.concat(extraerUsuarios(json));
                                    nJson++;
                                } else if (zipPerfil) {
                                    window.Perfil.procesarEntrada(relativePath, json, zipPerfil);
                                }
                            }
                        } catch (e) {
                            console.error('Error procesando fichero:', relativePath, e);
                        }
                        hechos++;
                        progressFill.style.width = `${10 + Math.floor(((i + hechos / (entries.length || 1)) / files.length) * 85)}%`;
                    }
                    await abierto.cerrar();
                }

                progressFill.style.width = '100%';
                // Con varios ZIP, las listas de seguidores/seguidos se toman SOLO del export más reciente:
                // mezclar exports antiguos resucita cuentas que ya no sigues o que ya no te siguen.
                const fechaLista = l => { let m = 0; for (const u of l.seg) if ((u.timestamp || 0) > m) m = u.timestamp; for (const u of l.sig) if ((u.timestamp || 0) > m) m = u.timestamp; return m; };
                const conListas = listasPorZip.filter(l => l.seg.length || l.sig.length);
                let avisoListas = '';
                let elegida = conListas[0];
                conListas.forEach(l => { if (fechaLista(l) > fechaLista(elegida)) elegida = l; });
                if (elegida) {
                    zipFollowersArray = unirUsuarios(elegida.seg);
                    zipFollowingArray = unirUsuarios(elegida.sig);
                    if (conListas.length > 1) avisoListas = t('Había {n} ZIP con listas; se usó «{nombre}» (el más reciente) para seguidores y seguidos.', { n: conListas.length, nombre: elegida.nombre });
                }
                // Cuentas que dejaste de seguir después de seguirlas: no deben aparecer como seguidas.
                let quitadas = 0;
                if (zipPerfil && zipPerfil.rel.dejados.length && zipFollowingArray.length) {
                    const dejadoTs = new Map();
                    zipPerfil.rel.dejados.forEach(o => { if (o.username) dejadoTs.set(o.username, Math.max(dejadoTs.get(o.username) || 0, o.timestamp || 0)); });
                    const antes = zipFollowingArray.length;
                    zipFollowingArray = zipFollowingArray.filter(o => {
                        const t = dejadoTs.get(o.username);
                        return !(t !== undefined && t >= (o.timestamp || 0));
                    });
                    quitadas = antes - zipFollowingArray.length;
                }
                zipAviso = [avisoListas, quitadas ? t('Se descartaron {n} cuenta(s) de «seguidos» porque dejaste de seguirlas después de seguirlas.', { n: quitadas }) : ''].filter(Boolean).join(' ');

                setTimeout(() => {
                    progressContainer.classList.remove('active');
                }, 500);

                const extras = zipPerfil ? window.Perfil.secciones(zipPerfil) : [];
                const omitidos = zipPerfil ? zipPerfil.htmlOmitidos : 0;
                if (zipFollowersArray.length > 0 || zipFollowingArray.length > 0 || extras.length) {
                    tag.innerText = t('Procesado: {a} seguidores y {b} seguidos', { a: zipFollowersArray.length, b: zipFollowingArray.length }) +
                        (nHtml && !nJson ? t(' (formato HTML)') : '') +
                        (extras.length ? t(' · también: {lista}', { lista: extras.join(', ') }) : '');
                    tag.style.color = 'var(--accent-green)';
                    if (omitidos > 0) {
                        mostrarEstado(t('Descarga en HTML: se han leído seguidores y seguidos. Para analizar interacciones, actividad y mensajes, vuelve a pedir la descarga en JSON.'), 'success');
                    } else {
                        mostrarEstado(t('Archivo preparado. Pulsa «Analizar mi perfil».') + (zipAviso ? ' ' + zipAviso : ''), 'success');
                    }
                    trigHaptic(60);
                    return true;
                } else {
                    tag.innerText = t('No se encontraron seguidores ni seguidos en este ZIP');
                    tag.style.color = 'var(--accent-rose)';
                    mostrarEstado(t('El ZIP no contiene seguidores ni seguidos. Al pedir la descarga, marca «Seguidores y seguidos» y elige el intervalo «Desde el principio». Si necesitas ayuda, abre la guía de descarga.'), 'error');
                }

            } catch (error) {
                console.error(error);
                progressContainer.classList.remove('active');
                const motivo = String((error && error.message) || error || '').slice(0, 140);
                tag.innerText = t('No se pudo leer el ZIP') + (motivo ? ` (${motivo})` : '');
                tag.style.color = 'var(--accent-rose)';
                mostrarEstado(t('No se pudo leer el ZIP. Comprueba que la descarga de Instagram esté completa y que no lo hayas descomprimido. Si sigue fallando, descárgalo de nuevo desde el enlace del correo.'), 'error');
            }
            return false;
        }

        /* ---- Entradas directas: compartir con Golifiar, «Abrir con» y Android ---- */
        async function analizarArchivosRecibidos(files) {
            if (!files.length) return;
            cambiarVista('auditoria');
            cambiarModoUpload('zip');
            mostrarToast(t('ZIP recibido. Analizando…'));
            if (await procesarArchivosZip(files, null)) await ejecutarAnalisis();
        }

        async function leerCompartidos() {
            try {
                const cache = await caches.open('golifiar-compartido');
                const claves = await cache.keys();
                const files = [];
                for (const req of claves) {
                    const resp = await cache.match(req);
                    if (!resp) continue;
                    const nombre = decodeURIComponent(new URL(req.url).pathname.split('/').pop() || 'descarga.zip');
                    files.push(new File([await resp.blob()], nombre, { type: 'application/zip' }));
                    await cache.delete(req);
                }
                return files;
            } catch (e) { console.error('Compartidos:', e); return []; }
        }

        // Android nativo: MainActivity llama a esta función con la ruta del ZIP recibido
        window.golifiarArchivoCompartido = async function (url, nombre) {
            try {
                const blob = await (await fetch(url)).blob();
                await analizarArchivosRecibidos([new File([blob], nombre || 'descarga.zip', { type: 'application/zip' })]);
                return true;
            } catch (e) {
                console.error('Archivo compartido:', e);
                mostrarEstado(t('No se pudo abrir el archivo recibido. Elige el ZIP desde aquí.'), 'error');
                return false;
            }
        };

        function iniciarEntradasDirectas() {
            const q = new URLSearchParams(location.search).get('compartido');
            if (q !== null) {
                history.replaceState(null, '', location.pathname);
                if (q === 'error' || q === '0') mostrarEstado(t('No se recibió ningún archivo. Elige el ZIP desde aquí.'), 'error');
                else leerCompartidos().then(analizarArchivosRecibidos);
            }
            if ('launchQueue' in window) {
                window.launchQueue.setConsumer(async params => {
                    const files = [];
                    for (const h of params.files || []) files.push(await h.getFile());
                    analizarArchivosRecibidos(files);
                });
            }
        }
        window.addEventListener('load', iniciarEntradasDirectas);

        // Une listas de usuarios (varios ZIP o varios ficheros) conservando la fecha más reciente
        function unirUsuarios(arr) {
            const m = new Map();
            arr.forEach(o => { if (!m.has(o.username) || o.timestamp > m.get(o.username)) m.set(o.username, o.timestamp); });
            return Array.from(m.entries()).map(([username, timestamp]) => ({ username, timestamp }));
        }

        /* ---- Lectura de la descarga en formato HTML ---- */
        const MESES = { ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5, jul: 6, ago: 7, aug: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11, dec: 11 };
        const RESERVADOS_IG = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'direct', 'stories', 'tv', 'about', 'legal', 'privacy', 'help', 'web', 'download', 'developer', 'directory', 'press', 'api', 'challenge', 'static']);

        // Instagram escribe la fecha en el idioma de la cuenta: «oct 01, 2024 3:45 pm», «1 de octubre de 2024», «2024-10-01»...
        function parseFechaHtml(txt) {
            if (!txt) return 0;
            let m, y, mo, d, h = 0, mi = 0, pm = '';
            if ((m = txt.match(/([A-Za-zÀ-ÿ]{3,10})\.?\s+(\d{1,2}),?\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})\s*([ap])\.?\s?m\.?)?/i)) && MESES[m[1].slice(0, 3).toLowerCase()] !== undefined) {
                mo = MESES[m[1].slice(0, 3).toLowerCase()]; d = +m[2]; y = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); pm = (m[6] || '').toLowerCase();
            } else if ((m = txt.match(/(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ]{3,10})\.?\s+de\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/i)) && MESES[m[2].slice(0, 3).toLowerCase()] !== undefined) {
                mo = MESES[m[2].slice(0, 3).toLowerCase()]; d = +m[1]; y = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0);
            } else if ((m = txt.match(/(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{2}):(\d{2}))?/))) {
                y = +m[1]; mo = +m[2] - 1; d = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0);
            } else return 0;
            if (pm === 'p' && h < 12) h += 12;
            if (pm === 'a' && h === 12) h = 0;
            const t = new Date(y, mo, d, h, mi).getTime();
            return isNaN(t) ? 0 : Math.floor(t / 1000);
        }

        function usuarioDeEnlace(href) {
            try {
                const u = new URL(href, 'https://www.instagram.com');
                if (!/^(www\.|m\.)?instagram\.com$/i.test(u.hostname)) return '';
                const parts = u.pathname.split('/').filter(Boolean);
                if (parts[0] === '_u') parts.shift();
                return normalizarUsuarioExportado(parts[0]);
            } catch (e) { return ''; }
        }

        function extraerUsuariosHtml(html) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const sel = 'a[href*="instagram.com"]';
            const mapa = new Map();
            const anotar = (u, ts) => { if (u && (!mapa.has(u) || ts > mapa.get(u))) mapa.set(u, ts || 0); };

            doc.querySelectorAll(sel).forEach(a => {
                const u = usuarioDeEnlace(a.getAttribute('href'));
                if (!u) return;
                let ts = 0, nodo = a;
                for (let i = 0; i < 4 && !ts; i++) {
                    nodo = nodo.parentElement;
                    if (!nodo || nodo.querySelectorAll(sel).length > 1) break;
                    ts = parseFechaHtml(nodo.textContent);
                }
                anotar(u, ts);
            });

            if (mapa.size === 0) {
                // Variante antigua: el nombre aparece solo como título de cada fila
                doc.querySelectorAll('h2').forEach(h => {
                    const t = h.textContent.trim().toLowerCase();
                    if (/^[a-z0-9._]{1,30}$/.test(t) && !['followers', 'following', 'seguidores', 'seguidos', 'siguiendo'].includes(t)) {
                        anotar(t, parseFechaHtml(h.parentElement ? h.parentElement.textContent : ''));
                    }
                });
            }
            return Array.from(mapa.entries()).map(([username, timestamp]) => ({ username, timestamp }));
        }

        // Lee un fichero suelto (JSON o HTML) y devuelve la lista de usuarios
        async function leerUsuariosArchivo(file) {
            if (/\.html?$/i.test(file.name)) return extraerUsuariosHtml(await file.text());
            return extraerUsuarios(JSON.parse(await file.text()));
        }

        function normalizarUsuarioExportado(value) {
            const username = String(value || '').trim().toLowerCase();
            return /^[a-z0-9._]{1,30}$/.test(username) && !RESERVADOS_IG.has(username) ? username : '';
        }

        function extraerUsuarios(data) {
            let registros = [];
            function buscarUsuarios(nodo) {
                if (Array.isArray(nodo)) {
                    nodo.forEach(buscarUsuarios);
                } else if (nodo !== null && typeof nodo === 'object') {
                    if (Array.isArray(nodo.string_list_data)) {
                        nodo.string_list_data.forEach(item => {
                            let username = "";
                            let timestamp = item.timestamp || 0;
                            if (item.value && typeof item.value === 'string' && item.value.trim() !== "") {
                                username = item.value;
                            } else if (nodo.title && typeof nodo.title === 'string' && nodo.title.trim() !== "") {
                                username = nodo.title;
                            } else if (item.href && typeof item.href === 'string') {
                                const partes = item.href.split('/').filter(p => p !== "");
                                username = partes[partes.length - 1]; 
                            }
                            username = normalizarUsuarioExportado(username);
                            if (username) {
                                registros.push({ username, timestamp: Number(timestamp) || 0 });
                            }
                        });
                    } else {
                        Object.values(nodo).forEach(buscarUsuarios);
                    }
                }
            }
            buscarUsuarios(data);
            const map = new Map();
            registros.forEach(r => {
                if (!map.has(r.username) || r.timestamp > map.get(r.username)) {
                    map.set(r.username, r.timestamp);
                }
            });
            return Array.from(map.entries()).map(([username, timestamp]) => ({ username, timestamp }));
        }

        function animarContador(id, finalValue, isPercentage = false) {
            const el = document.getElementById(id);
            if (!el) return;
            let start = 0;
            const duration = 900;
            const startTime = performance.now();

            function update(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const current = Math.floor(progress * (finalValue - start) + start);
                el.innerText = isPercentage ? `${current}%` : current;

                if (progress < 1) {
                    requestAnimationFrame(update);
                } else {
                    el.innerText = isPercentage ? `${finalValue}%` : finalValue;
                }
            }
            requestAnimationFrame(update);
        }

        async function ejecutarAnalisis() {
            trigHaptic(50);
            const resultsSection = document.getElementById('resultsSection');
            resultsSection.classList.add('hidden');
            mostrarEstado(t('Validando los archivos seleccionados…'), '');

            const wrapper = document.getElementById('resultsWrapper');
            wrapper.innerHTML = `
                <div class="skeleton-loader">
                    <div class="skeleton-item"><div class="skeleton-line"></div><div class="skeleton-badge"></div></div>
                    <div class="skeleton-item"><div class="skeleton-line" style="width: 150px;"></div><div class="skeleton-badge"></div></div>
                    <div class="skeleton-item"><div class="skeleton-line" style="width: 110px;"></div><div class="skeleton-badge"></div></div>
                </div>
            `;
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

            await new Promise(r => setTimeout(r, 400));

            try {
                let followersObjs = [];
                let followingObjs = [];

                if (usarModoZip) {
                    const hayExtras = zipPerfil && window.Perfil.secciones(zipPerfil).length > 0;
                    if (zipFollowersArray.length === 0 && zipFollowingArray.length === 0 && !hayExtras) {
                        mostrarEstado(t('Carga un ZIP de Instagram válido antes de ejecutar el análisis.'), 'error');
                        return;
                    }
                    followersObjs = zipFollowersArray;
                    followingObjs = zipFollowingArray;
                } else {
                    const followersInputs = document.getElementById('followersFile').files;
                    const followingInput = document.getElementById('followingFile').files[0];

                    if (followersInputs.length === 0 && !followingInput) {
                        mostrarEstado(t('Selecciona al menos un archivo de seguidores o seguidos (JSON o HTML).'), 'error');
                        return;
                    }

                    for (let file of followersInputs) {
                        followersObjs = followersObjs.concat(await leerUsuariosArchivo(file));
                    }
                    if (followingInput) {
                        followingObjs = await leerUsuariosArchivo(followingInput);
                    }
                    followersObjs = unirUsuarios(followersObjs);
                }
                
                const followersMap = new Map(followersObjs.map(o => [o.username, o.timestamp]));
                const followingMap = new Map(followingObjs.map(o => [o.username, o.timestamp]));

                const followersArray = Array.from(followersMap.keys());
                const followingArray = Array.from(followingMap.keys());

                const followersSet = new Set(followersArray);
                const followingSet = new Set(followingArray);

                const buildObj = (arr, map) => arr.map(u => ({ username: u, timestamp: map.get(u) || 0 }));

                usuariosSinRetornoGlobal = buildObj(followingArray.filter(user => !followersSet.has(user)), followingMap);
                usuariosFansGlobal = buildObj(followersArray.filter(user => !followingSet.has(user)), followersMap);
                usuariosMutuosGlobal = buildObj(followingArray.filter(user => followersSet.has(user)), followingMap);

                let reciprocityRate = 100;
                if (followingArray.length > 0) {
                    const mutualsCount = usuariosMutuosGlobal.length;
                    reciprocityRate = Math.round((mutualsCount / followingArray.length) * 100);
                }

                document.getElementById('countNoTeSiguen').innerText = usuariosSinRetornoGlobal.length;
                document.getElementById('countFans').innerText = usuariosFansGlobal.length;
                document.getElementById('countMutuos').innerText = usuariosMutuosGlobal.length;

                resultsSection.classList.remove('hidden');
                animarContador('valFollowers', followersArray.length);
                animarContador('valFollowing', followingArray.length);
                animarContador('valDiscrepancy', usuariosSinRetornoGlobal.length);
                animarContador('valReciprocity', reciprocityRate, true);

                renderizarResultadosActuales();
                const resultsStatus = document.getElementById('resultsStatus');
                ultimoTotalRegistros = followersArray.length + followingArray.length;
                if (resultsStatus) resultsStatus.textContent = t('Análisis completado: {n} registros procesados.', { n: ultimoTotalRegistros }) + ' ' + t('Estos resultados reflejan la fecha de tu exportación, no el estado actual de Instagram.');
                if (window.Perfil) window.Perfil.render(usarModoZip ? zipPerfil : window.Perfil.nuevo(), followersObjs, followingObjs);
                requestAnimationFrame(() => resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                mostrarEstado(t('Análisis completado.'), 'success');
                trigHaptic(80);

            } catch (error) {
                console.error(error);
                mostrarEstado(t('No se pudo completar el análisis. Comprueba que los archivos procedan de la descarga de Instagram.'), 'error');
                resultsSection.classList.add('hidden');
            }
        }
