        function cambiarCategoria(cat) {
            trigHaptic(20);
            categoriaActual = cat;

            document.getElementById('tabNoTeSiguen').classList.remove('active');
            document.getElementById('tabFans').classList.remove('active');
            document.getElementById('tabMutuos').classList.remove('active');

            if (cat === 'noteSiguen') document.getElementById('tabNoTeSiguen').classList.add('active');
            if (cat === 'fans') document.getElementById('tabFans').classList.add('active');
            if (cat === 'mutuos') document.getElementById('tabMutuos').classList.add('active');

            document.getElementById('searchInput').value = '';
            document.getElementById('letterFilter').value = '';
            document.getElementById('typeFilter').value = 'todos';
            document.getElementById('ageFilter').value = 'todas';
            renderizarResultadosActuales();
        }

        function obtenerListaActual() {
            let lista = [];
            if (categoriaActual === 'noteSiguen') lista = [...usuariosSinRetornoGlobal];
            else if (categoriaActual === 'fans') lista = [...usuariosFansGlobal];
            else if (categoriaActual === 'mutuos') lista = [...usuariosMutuosGlobal];
            else lista = [...usuariosSinRetornoGlobal];

            lista.sort((a, b) => {
                if (ordenAscendente) return a.username.localeCompare(b.username);
                return b.username.localeCompare(a.username);
            });
            return lista;
        }

        function alternarOrden() {
            trigHaptic(30);
            ordenAscendente = !ordenAscendente;
            renderizarResultadosActuales();
        }

        let ultimoTotalRegistros = null;
        // Al cambiar de idioma se repintan la lista de Seguidores y el estado (el resto de paneles lo hace perfil.js).
        I18n.alAplicar(() => {
            const rs = document.getElementById('resultsStatus');
            if (rs && ultimoTotalRegistros !== null) rs.textContent = t('Análisis completado: {n} registros procesados.', { n: ultimoTotalRegistros });
            const sec = document.getElementById('resultsSection');
            if (sec && !sec.classList.contains('hidden')) renderizarResultadosActuales();
        });

        function renderizarResultadosActuales() {
            filtrarResultados();
        }

        function escHtml(t) {
            return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        function renderizarResultados(lista) {
            const wrapper = document.getElementById('resultsWrapper');

            if (lista.length === 0) {
                wrapper.innerHTML = `
                    <div class="empty-state">
                        No se han detectado registros en esta categoría con los filtros seleccionados.
                    </div>
                `;
                return;
            }

            let badgeClass = 'badge-status';
            let badgeText = t('Sin Retorno');
            if (categoriaActual === 'fans') { badgeClass = 'badge-fan'; badgeText = t('Te Sigue'); }
            if (categoriaActual === 'mutuos') { badgeClass = 'badge-mutual'; badgeText = t('Mutuo'); }

            let html = '<div class="results-list">';
            lista.forEach((obj) => {
                const user = obj.username;
                let metaInfo = badgeText;
                if (obj.timestamp > 0) {
                    const fecha = I18n.fecha(obj.timestamp);
                    metaInfo = `${badgeText} (${fecha})`;
                }

                const invalido = nombreInvalido(user);
                const marcado = noDisponibles.has(user);
                const dudosa = invalido || marcado;
                const enlace = invalido
                    ? `<span class="user-link">@${escHtml(user)}</span>`
                    : `<a href="https://www.instagram.com/${encodeURIComponent(user)}/" target="_blank" rel="noopener noreferrer" class="user-link" title="${t('Abrir el perfil en Instagram')}">
                            @${escHtml(user)}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </a>`;

                html += `
                    <div class="user-card${dudosa ? ' no-disponible' : ''}">
                    ${enlace}
                    <div class="user-actions">
                        ${invalido ? `<span class="user-flag">${t('Nombre no válido')}</span>` : (marcado ? `<span class="user-flag">${t('No disponible')}</span>` : '')}
                        ${invalido ? '' : `<button class="user-mark" type="button" data-user="${escHtml(user)}" onclick="marcarNoDisponible(this.dataset.user)" title="${t('Si el perfil da error al abrirlo, márcalo para ocultarlo')}">${marcado ? t('Mostrar') : t('No existe')}</button>`}
                        <span class="${badgeClass}">${metaInfo}</span>
                    </div>
                </div>
                `;
            });
            html += '</div>';

            wrapper.innerHTML = html;
        }

        /* ---- Cuentas no disponibles (eliminadas, desactivadas o con nombre cambiado) ---- */
        const CLAVE_NO_DISP = 'golifiar-no-disponibles';
        function leerNoDisponibles() {
            try { return new Set(JSON.parse(localStorage.getItem(CLAVE_NO_DISP) || '[]')); } catch (e) { return new Set(); }
        }
        let noDisponibles = leerNoDisponibles();
        function guardarNoDisponibles() {
            try { localStorage.setItem(CLAVE_NO_DISP, JSON.stringify([...noDisponibles])); } catch (e) { /* sin almacenamiento */ }
        }
        // Instagram admite letras, números, puntos y guiones bajos (máx. 30). Lo demás no puede ser una cuenta real.
        function nombreInvalido(u) {
            return !u || /^__deleted__/i.test(u) || u.length > 30 || !/^[a-z0-9._]+$/i.test(u);
        }
        function esNoDisponible(u) { return nombreInvalido(u) || noDisponibles.has(u); }
        function marcarNoDisponible(u) {
            trigHaptic(25);
            if (noDisponibles.has(u)) noDisponibles.delete(u); else noDisponibles.add(u);
            guardarNoDisponibles();
            filtrarResultados();
            mostrarToast(noDisponibles.has(u) ? t('@{u} marcada como no disponible.', { u }) : t('@{u} vuelve a mostrarse.', { u }));
        }

        function listaFiltrada(conOcultas) {
            const query = document.getElementById('searchInput').value.toLowerCase().trim();
            const letter = document.getElementById('letterFilter').value.toLowerCase().trim();
            const type = document.getElementById('typeFilter').value;
            const age = document.getElementById('ageFilter').value;
            const ocultar = document.getElementById('hideUnavail').checked && !conOcultas;
            const ahora = Date.now() / 1000;
            const base = obtenerListaActual();
            const nOcultas = base.filter(o => esNoDisponible(o.username)).length;

            const lista = base.filter(obj => {
                const user = obj.username;
                if (ocultar && esNoDisponible(user)) return false;
                const matchQuery = user.includes(query);
                const matchLetter = letter === "" || user.startsWith(letter);

                let matchType = true;
                const hasNumbers = /\d/.test(user);
                if (type === 'sin_numeros') matchType = !hasNumbers;
                if (type === 'con_numeros') matchType = hasNumbers;
                if (type === 'largos') matchType = user.length > 15;
                if (type === 'cortos') matchType = user.length <= 15;

                let matchAge = true;
                if (obj.timestamp > 0) {
                    const diffMonths = (ahora - obj.timestamp) / (60 * 60 * 24 * 30);
                    if (age === 'recientes') matchAge = diffMonths <= 6;
                    if (age === 'antiguas') matchAge = diffMonths > 12;
                }
                return matchQuery && matchLetter && matchType && matchAge;
            });
            return { lista, nOcultas };
        }

        function filtrarResultados() {
            const { lista, nOcultas } = listaFiltrada();
            const cnt = document.getElementById('countUnavail');
            if (cnt) cnt.textContent = nOcultas;
            const summary = document.getElementById('filterSummary');
            if (summary) summary.textContent = t('{n} resultado(s) visibles en esta categoría.', { n: lista.length });
            renderizarResultados(lista);
        }

        function copiarUsuarios() {
            trigHaptic(40);
            const lista = listaFiltrada().lista;

            if (lista.length === 0) {
                alert(t('No hay registros disponibles para copiar.'));
                return;
            }
            const text = lista.map(u => `@${u.username}`).join('\n');
            navigator.clipboard.writeText(text).then(() => {
                alert(t('Lista filtrada de perfiles copiada al portapapeles.'));
            }).catch(err => {
                console.error('Error al copiar:', err);
            });
        }

        function exportarCSV() {
            trigHaptic(40);
            const lista = listaFiltrada().lista;

            if (lista.length === 0) {
                alert(t('No hay registros disponibles para exportar.'));
                return;
            }
            const csvContent = "data:text/csv;charset=utf-8," + t('Usuario,FechaConexion') + "\n" + lista.map(u => `@${u.username},${u.timestamp ? I18n.fecha(u.timestamp) : t('N/D')}`).join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `golifiar_${categoriaActual}_2026.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        function limpiarFiltros() {
            const hu = document.getElementById('hideUnavail'); if (hu) hu.checked = true;
            document.getElementById('searchInput').value = '';
            document.getElementById('letterFilter').value = '';
            document.getElementById('typeFilter').value = 'todos';
            document.getElementById('ageFilter').value = 'todas';
            renderizarResultadosActuales();
        }

        function exportarJSON() {
            const data = {
                generatedAt: new Date().toISOString(),
                category: categoriaActual,
                followers: usuariosFansGlobal,
                following: usuariosMutuosGlobal.concat(usuariosSinRetornoGlobal)
            };
            descargarArchivo(`golifiar-auditoria-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
        }

        function descargarArchivo(name, content, type) {
            const blob = new Blob([content], { type });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = name;
            link.click();
            URL.revokeObjectURL(url);
        }

        function premiumActivo() {
            return localStorage.getItem('golifiar-premium-demo') === 'true';
        }

        function activarPremiumDemo() {
            localStorage.setItem('golifiar-premium-demo', 'true');
            document.getElementById('premiumStatus').textContent = t('Premium de demostración activo en este dispositivo');
            document.getElementById('historyPanel').classList.remove('hidden');
            cargarHistorial();
            mostrarToast(t('Premium de demostración activado. No es una compra real.'));
        }

        function requerirPremium() {
            if (premiumActivo()) return true;
            mostrarToast(t('Esta función pertenece a Golifiar Premium. Pulsa “Probar Premium” para verla.'));
            return false;
        }

        function cambiarFiltroPremium(select) {
            if (!requerirPremium()) {
                select.value = select.id === 'typeFilter' ? 'todos' : 'todas';
                return;
            }
            filtrarResultados();
        }

        function guardarAnalisis() {
            if (!requerirPremium()) return;
            const history = JSON.parse(localStorage.getItem('golifiar-history') || '[]');
            history.unshift({
                id: Date.now(),
                date: new Date().toISOString(),
                followers: document.getElementById('valFollowers').textContent,
                following: document.getElementById('valFollowing').textContent,
                discrepancy: document.getElementById('valDiscrepancy').textContent,
                reciprocity: document.getElementById('valReciprocity').textContent
            });
            localStorage.setItem('golifiar-history', JSON.stringify(history.slice(0, 10)));
            document.getElementById('historyPanel').classList.remove('hidden');
            cargarHistorial();
            mostrarToast(t('Análisis guardado únicamente en este dispositivo.'));
        }

        function cargarHistorial() {
            const list = document.getElementById('historyList');
            if (!list) return;
            const history = JSON.parse(localStorage.getItem('golifiar-history') || '[]');
            list.innerHTML = history.length ? history.map(item => `
                <div class="history-item">
                    <span>${new Date(item.date).toLocaleString(I18n.locale)}</span>
                    <span>${t('{a} seguidores · {b} sin retorno', { a: item.followers, b: item.discrepancy })}</span>
                </div>
            `).join('') : `<span class="premium-lock">${t('Todavía no hay análisis guardados.')}</span>`;
        }

        function borrarHistorial() {
            if (!requerirPremium()) return;
            localStorage.removeItem('golifiar-history');
            cargarHistorial();
            mostrarToast(t('Historial local eliminado.'));
        }

        function generarInformePremium() {
            if (!requerirPremium()) return;
            const val = id => document.getElementById(id).textContent;
            const html = `<!doctype html><html lang="${I18n.lang}"><head><meta charset="utf-8"><title>${t('Informe Golifiar')}</title><style>body{font:16px Arial;max-width:760px;margin:40px auto;color:#172033}h1{color:#0b6e99}.metric{display:inline-block;margin:8px;padding:16px;border:1px solid #e5e7eb;border-radius:8px}</style></head><body><h1>${t('Informe de auditoría Golifiar')}</h1><p>${t('Generado el {fecha}', { fecha: new Date().toLocaleString(I18n.locale) })}</p><div class="metric">${t('Seguidores')}: ${val('valFollowers')}</div><div class="metric">${t('Seguidos')}: ${val('valFollowing')}</div><div class="metric">${t('Sin retorno')}: ${val('valDiscrepancy')}</div><div class="metric">${t('Reciprocidad')}: ${val('valReciprocity')}</div><p>${t('Este informe se ha generado localmente. Los datos proceden de la exportación de Instagram y pueden no reflejar el estado actual de los perfiles.')}</p></body></html>`;
            descargarArchivo(`golifiar-informe-${new Date().toISOString().slice(0, 10)}.html`, html, 'text/html');
        }

        function compartirResultados() {
            trigHaptic(40);
            const query = document.getElementById('searchInput').value.toLowerCase().trim();
            const letter = document.getElementById('letterFilter').value.toLowerCase().trim();
            const type = document.getElementById('typeFilter').value;
            const age = document.getElementById('ageFilter').value;
            const ahora = Date.now() / 1000;

            const lista = obtenerListaActual().filter(obj => {
                const user = obj.username;
                const matchQuery = user.includes(query);
                const matchLetter = letter === "" || user.startsWith(letter);
                let matchType = true;
                const hasNumbers = /\d/.test(user);
                if (type === 'sin_numeros') matchType = !hasNumbers;
                if (type === 'con_numeros') matchType = hasNumbers;
                if (type === 'largos') matchType = user.length > 15;
                if (type === 'cortos') matchType = user.length <= 15;

                let matchAge = true;
                if (obj.timestamp > 0) {
                    const diffMonths = (ahora - obj.timestamp) / (60 * 60 * 24 * 30);
                    if (age === 'recientes') matchAge = diffMonths <= 6;
                    if (age === 'antiguas') matchAge = diffMonths > 12;
                }
                return matchQuery && matchLetter && matchType && matchAge;
            });

            if (lista.length === 0) {
                alert(t('No hay registros disponibles para compartir.'));
                return;
            }
            if (navigator.share) {
                navigator.share({
                    title: 'Golifiar',
                    text: t('Análisis completado con Golifiar: {n} perfiles en esta categoría.', { n: lista.length }),
                    url: window.location.href
                }).catch(console.error);
            } else {
                copiarUsuarios();
            }
        }
