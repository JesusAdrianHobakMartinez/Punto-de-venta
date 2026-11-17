import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, vi } from 'vitest';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function signIn(fixture: ComponentFixture<App>, username: string, password: string): Promise<void> {
    const component = fixture.componentInstance;
    Reflect.set(component, 'employees', [
      { id: 'test-admin', name: 'Administrador', username: 'admin-test', password: 'secure-admin-test-2026', role: 'Administrador' },
      { id: 'test-ana', name: 'Ana García', username: 'ana-test', password: 'secure-employee-test-2026', role: 'Empleado', scheduleStart: '09:00', scheduleEnd: '18:00' },
      { id: 'test-luis', name: 'Luis Hernández', username: 'luis-test', password: 'secure-employee-test-2026', role: 'Empleado', scheduleStart: '10:00', scheduleEnd: '19:00' },
    ]);
    Reflect.set(component, 'needsAdminSetup', false);
    Reflect.set(component, 'loginUsername', username);
    Reflect.set(component, 'loginPassword', password);
    const login = Reflect.get(component, 'login');
    if (typeof login !== 'function') throw new Error('No se encontró el método de inicio de sesión.');
    if (!fixture.ngZone) throw new Error('La zona de pruebas no está disponible.');
    fixture.ngZone.run(() => login.call(component));
    fixture.detectChanges();
    if (Reflect.get(component, 'showShiftOpening')) {
      const startEmployeeShift = Reflect.get(component, 'startEmployeeShift');
      if (typeof startEmployeeShift !== 'function') {
        throw new Error('No se encontró la operación para iniciar el turno.');
      }
      fixture.ngZone.run(() => startEmployeeShift.call(component));
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('keeps retrying a valid mobile connection after the desktop is offline at startup', async () => {
    const fixture = TestBed.createComponent(App);
    const component = fixture.componentInstance;
    Reflect.set(component, 'mobileServerUrl', 'http://192.168.1.20:43827');
    Reflect.set(component, 'mobileSyncToken', 'test-connection-key');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const connectStore = Reflect.get(component, 'connectStore');
    if (typeof connectStore !== 'function') throw new Error('No se encontró la conexión móvil.');

    await connectStore.call(component);

    const pollHandle = Reflect.get(component, 'pollHandle') as number | null;
    expect(pollHandle).not.toBeNull();
    expect(localStorage.getItem('tienda-sync-server')).toBe('http://192.168.1.20:43827');
    expect(localStorage.getItem('tienda-sync-token')).toBe('test-connection-key');
    if (pollHandle !== null) window.clearInterval(pollHandle);
  });

  it('saves a separate desktop client address and key for automatic reconnection', async () => {
    const fixture = TestBed.createComponent(App);
    const component = fixture.componentInstance;
    const createStoreData = Reflect.get(component, 'createStoreData');
    const connectStore = Reflect.get(component, 'connectStore');
    if (typeof createStoreData !== 'function' || typeof connectStore !== 'function') {
      throw new Error('No se encontraron las operaciones de conexión de escritorio.');
    }
    const data = createStoreData.call(component);
    Reflect.set(component, 'isDesktopApp', true);
    Reflect.set(component, 'desktopServerUrl', 'http://100.100.20.5:43827');
    Reflect.set(component, 'desktopSyncToken', 'unique-desktop-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data, revision: 3 }),
    }));

    await connectStore.call(component);

    expect(Reflect.get(component, 'storeConnected')).toBe(true);
    expect(localStorage.getItem('tienda-desktop-server')).toBe('http://100.100.20.5:43827');
    expect(localStorage.getItem('tienda-desktop-token')).toBe('unique-desktop-key');
    expect(localStorage.getItem('tienda-sync-server')).toBeNull();
    expect(localStorage.getItem('tienda-sync-token')).toBeNull();
    const pollHandle = Reflect.get(component, 'pollHandle') as number | null;
    if (pollHandle !== null) window.clearInterval(pollHandle);
  });

  it('restores the connected state when the desktop returns with the same revision', async () => {
    const fixture = TestBed.createComponent(App);
    const component = fixture.componentInstance;
    const createStoreData = Reflect.get(component, 'createStoreData');
    const refreshSharedStore = Reflect.get(component, 'refreshSharedStore');
    if (typeof createStoreData !== 'function' || typeof refreshSharedStore !== 'function') {
      throw new Error('No se encontraron las operaciones de sincronización.');
    }
    const data = createStoreData.call(component);
    Reflect.set(component, 'mobileServerUrl', 'http://192.168.1.20:43827');
    Reflect.set(component, 'mobileSyncToken', 'test-connection-key');
    Reflect.set(component, 'serverRevision', 5);
    Reflect.set(component, 'storeConnected', false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data, revision: 5 }),
    }));

    await refreshSharedStore.call(component);

    expect(Reflect.get(component, 'storeConnected')).toBe(true);
    expect(Reflect.get(component, 'connectionStatus')).toBe('Conectado a la tienda principal.');
  });

  it('resends pending mobile changes when the saved server revision is available again', async () => {
    const fixture = TestBed.createComponent(App);
    const component = fixture.componentInstance;
    const createStoreData = Reflect.get(component, 'createStoreData');
    const refreshSharedStore = Reflect.get(component, 'refreshSharedStore');
    if (typeof createStoreData !== 'function' || typeof refreshSharedStore !== 'function') {
      throw new Error('No se encontraron las operaciones de sincronización.');
    }
    const data = createStoreData.call(component);
    Reflect.set(component, 'mobileServerUrl', 'http://192.168.1.20:43827');
    Reflect.set(component, 'mobileSyncToken', 'test-connection-key');
    Reflect.set(component, 'serverRevision', 5);
    Reflect.set(component, 'storeConnected', false);
    localStorage.setItem('tienda-sync-pending', JSON.stringify({ data, revision: 5 }));
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data, revision: 5 }) })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ revision: 6 }) }));

    await refreshSharedStore.call(component);
    await (Reflect.get(component, 'syncQueue') as Promise<void>);

    expect(Reflect.get(component, 'serverRevision')).toBe(6);
    expect(Reflect.get(component, 'storeConnected')).toBe(true);
    expect(localStorage.getItem('tienda-sync-pending')).toBeNull();
  });

  it('requires an employee to record the opening cash before starting a shift', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    Reflect.set(component, 'employees', [
      { id: 'test-ana', name: 'Ana García', username: 'ana-test', password: 'secure-employee-test-2026', role: 'Empleado' },
    ]);
    Reflect.set(component, 'needsAdminSetup', false);
    Reflect.set(component, 'loginUsername', 'ana-test');
    Reflect.set(component, 'loginPassword', 'secure-employee-test-2026');
    const login = Reflect.get(component, 'login');
    const startEmployeeShift = Reflect.get(component, 'startEmployeeShift');
    if (typeof login !== 'function' || typeof startEmployeeShift !== 'function' || !fixture.ngZone) {
      throw new Error('No se encontraron las operaciones de inicio de sesión y turno.');
    }
    fixture.ngZone.run(() => login.call(component));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(Reflect.get(component, 'showShiftOpening')).toBe(true);
    expect(Reflect.get(component, 'currentShift')).toBeUndefined();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Registra tu fondo inicial');

    Reflect.set(component, 'shiftOpeningAmount', 125.5);
    fixture.ngZone.run(() => startEmployeeShift.call(component));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(Reflect.get(component, 'showShiftOpening')).toBe(false);
    expect(Reflect.get(component, 'currentShift')).toMatchObject({ openingCash: 125.5, status: 'open' });
    expect(JSON.parse(localStorage.getItem('tienda-comercial-data') ?? '{}').shifts[0].openingCash).toBe(125.5);
  });

  it('requires an administrator account to be created on first launch', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Prepara tu tienda.');
    expect(text).toContain('Crear cuenta de administrador');
    expect(text).not.toContain('admin123');
    expect(text).not.toContain('empleado123');
  });

  it('creates and persists the first administrator without a default password', () => {
    const fixture = TestBed.createComponent(App);
    const component = fixture.componentInstance;
    Reflect.set(component, 'initialAdminName', 'Admin de prueba');
    Reflect.set(component, 'initialAdminUsername', 'admin-local');
    Reflect.set(component, 'initialAdminPassword', 'mi-clave-segura-2026');
    Reflect.set(component, 'confirmAdminPassword', 'mi-clave-segura-2026');
    const createInitialAdmin = Reflect.get(component, 'createInitialAdmin');
    if (typeof createInitialAdmin !== 'function' || !fixture.ngZone) {
      throw new Error('No se encontró la configuración inicial del administrador.');
    }
    fixture.ngZone.run(() => createInitialAdmin.call(component));
    fixture.detectChanges();
    expect(Reflect.get(component, 'currentUser')).toMatchObject({
      name: 'Admin de prueba',
      username: 'admin-local',
      role: 'Administrador',
    });
    expect(Reflect.get(component, 'needsAdminSetup')).toBe(false);
    expect(JSON.parse(localStorage.getItem('tienda-comercial-data') ?? '{}').employees).toHaveLength(1);
  });

  it('removes the legacy demo administrator and keeps existing store data', () => {
    localStorage.setItem('tienda-comercial-data', JSON.stringify({
      products: [{ id: 'p-old', name: 'Producto guardado', category: 'Botanas', price: 10, stock: 5, emoji: '🛍️', description: '' }],
      categories: ['Botanas'],
      employees: [
        { id: 'u1', name: 'Administrador', username: 'admin', password: 'admin123', role: 'Administrador' },
        { id: 'u2', name: 'Ana García', username: 'ana', password: 'empleado123', role: 'Empleado' },
        { id: 'u3', name: 'Luis Hernández', username: 'luis', password: 'empleado123', role: 'Empleado' },
        { id: 'u4', name: 'Empleado real', username: 'empleado-real', password: 'clave-propia-2026', role: 'Empleado' },
      ],
      sales: [],
    }));
    const fixture = TestBed.createComponent(App);
    const component = fixture.componentInstance;
    expect(Reflect.get(component, 'needsAdminSetup')).toBe(true);
    expect(Reflect.get(component, 'employees')).toEqual([
      { id: 'u4', name: 'Empleado real', username: 'empleado-real', password: 'clave-propia-2026', role: 'Empleado' },
    ]);
    expect((Reflect.get(component, 'products') as { id: string }[]).some((product) => product.id === 'p-old')).toBe(true);
  });

  it('records a sale and updates stock', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'ana-test', 'secure-employee-test-2026');

    const productsButton = fixture.nativeElement.querySelector('.side-nav button:nth-child(2)') as HTMLButtonElement;
    productsButton.click();
    fixture.detectChanges();
    const addButton = fixture.nativeElement.querySelector('.product-card .add-cart-button') as HTMLButtonElement;
    addButton.click();
    fixture.detectChanges();
    const receivedInput = fixture.nativeElement.querySelector('input[name="amountReceived"]') as HTMLInputElement;
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setInputValue?.call(receivedInput, '20');
    receivedInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(Reflect.get(fixture.componentInstance, 'amountReceived')).toBe(20);
    const checkoutButton = fixture.nativeElement.querySelector('.checkout-button') as HTMLButtonElement;
    expect(checkoutButton.disabled).toBe(false);
    checkoutButton.click();
    fixture.detectChanges();

    const saved = JSON.parse(localStorage.getItem('tienda-comercial-data') ?? '{}') as {
      products: { id: string; stock: number }[];
      sales: { total: number; employeeName: string; paymentMethod: string; changeGiven: number; shiftId?: string }[];
    };
    expect(saved.sales).toHaveLength(1);
    expect(saved.sales[0].total).toBe(18);
    expect(saved.sales[0].employeeName).toBe('Ana García');
    expect(saved.sales[0].paymentMethod).toBe('Efectivo');
    expect(saved.sales[0].changeGiven).toBe(2);
    expect(saved.sales[0].shiftId).toBeTruthy();
    expect(saved.products.find((product) => product.id === 'p1')?.stock).toBe(31);
  });

  it('requires an employee cash closing and reports the exit time and count to the administrator', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'ana-test', 'secure-employee-test-2026');
    const component = fixture.componentInstance;
    const shiftId = (Reflect.get(component, 'activeShiftId') as string);
    expect(shiftId).toBeTruthy();
    expect(Reflect.get(component, 'currentShift')).toBeTruthy();
    const openShift = Reflect.get(component, 'currentShift') as { id: string };
    Reflect.set(component, 'shifts', [{ ...openShift, openingCash: 100 }]);
    Reflect.set(component, 'sales', [
      { id: 'cash-sale', employeeId: 'test-ana', employeeName: 'Ana García', shiftId, date: new Date().toISOString(), total: 18, items: [], paymentMethod: 'Efectivo' },
      { id: 'card-sale', employeeId: 'test-ana', employeeName: 'Ana García', shiftId, date: new Date().toISOString(), total: 20, items: [], paymentMethod: 'Tarjeta' },
    ]);
    const completeCashClosing = Reflect.get(component, 'completeCashClosing');
    if (typeof completeCashClosing !== 'function' || !fixture.ngZone) {
      throw new Error('No se encontraron las operaciones de cierre de turno.');
    }
    const logoutButton = fixture.nativeElement.querySelector('.logout-button') as HTMLButtonElement;
    logoutButton.click();
    fixture.detectChanges();
    expect(Reflect.get(component, 'cashClosingShiftId')).toBe(shiftId);
    expect(Reflect.get(component, 'cashClosingShift')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Realiza tu corte final');
    expect(fixture.nativeElement.querySelector('.cash-closing-modal')).toBeTruthy();

    Reflect.set(component, 'cashCounts', { '1000': 0, '500': 0, '200': 0, '100': 1, '50': 0, '20': 0, '10': 1, '5': 1, '2': 1, '1': 0, '0.5': 0 });
    Reflect.set(component, 'cardReceiptTotal', 20);
    fixture.ngZone.run(() => completeCashClosing.call(component));
    fixture.detectChanges();

    const saved = JSON.parse(localStorage.getItem('tienda-comercial-data') ?? '{}') as {
      shifts: { status: string; openingCash: number; expectedTotal: number; cashCounted: number; cardReceipts: number; countedTotal: number; difference: number; endedAt: string; denominations: Record<string, number> }[];
    };
    expect(Reflect.get(component, 'currentUser')).toBeNull();
    expect(saved.shifts[0]).toMatchObject({
      status: 'closed',
      openingCash: 100,
      expectedTotal: 38,
      cashCounted: 117,
      cardReceipts: 20,
      countedTotal: 137,
      difference: -1,
    });
    expect(saved.shifts[0].endedAt).toBeTruthy();
    expect(saved.shifts[0].denominations['10']).toBe(1);

    const adminFixture = TestBed.createComponent(App);
    adminFixture.detectChanges();
    await signIn(adminFixture, 'admin-test', 'secure-admin-test-2026');
    const adminElement = adminFixture.nativeElement as HTMLElement;
    expect(adminElement.textContent).toContain('Cortes 1');
    const cutsButton = Array.from(adminElement.querySelectorAll('.side-nav button'))
      .find((button) => button.textContent?.includes('Cortes')) as HTMLButtonElement | undefined;
    if (!cutsButton) throw new Error('No se encontró el aviso del corte para el administrador.');
    cutsButton.click();
    adminFixture.detectChanges();
    expect(adminElement.querySelector('.shift-history-card')).toBeTruthy();
    expect(adminElement.textContent).toContain('EFECTIVO CONTADO');
    expect(Reflect.get(adminFixture.componentInstance, 'todayOpeningCash')).toBe(100);
    expect(Reflect.get(adminFixture.componentInstance, 'todayCashCuts')).toBe(17);
    expect(Reflect.get(adminFixture.componentInstance, 'todayCashRegisterTotal')).toBe(117);
    expect(Reflect.get(adminFixture.componentInstance, 'pendingCashClosingNotifications')).toBe(0);
  });

  it('starts the administrator daily cash register at zero on a new day while retaining shift history', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'admin-test', 'secure-admin-test-2026');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const previousDay = yesterday.toISOString();
    Reflect.set(fixture.componentInstance, 'shifts', [{
      id: 'previous-day-shift',
      employeeId: 'test-ana',
      employeeName: 'Ana García',
      startedAt: previousDay,
      endedAt: previousDay,
      openingCash: 100,
      cashCounted: 250,
      status: 'closed',
    }]);

    expect(Reflect.get(fixture.componentInstance, 'todayCashRegisterTotal')).toBe(0);
    const cutsButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.side-nav button'))
      .find((button) => button.textContent?.includes('Cortes')) as HTMLButtonElement | undefined;
    if (!cutsButton) throw new Error('No se encontró el apartado de cortes del administrador.');
    cutsButton.click();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Todavía no hay fondos iniciales ni cortes registrados hoy');
    expect(fixture.nativeElement.querySelector('.shift-history-card')).toBeTruthy();
  });

  it('lets administrators delete an incorrect sale and restores its stock', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'admin-test', 'secure-admin-test-2026');
    const component = fixture.componentInstance;
    Reflect.set(component, 'sales', [{
      id: 'sale-to-delete',
      employeeId: 'test-ana',
      employeeName: 'Ana García',
      date: new Date().toISOString(),
      total: 18,
      items: [{ productId: 'p1', name: 'Papas clásicas', price: 18, quantity: 2 }],
      paymentMethod: 'Efectivo',
    }]);
    const deleteSale = Reflect.get(component, 'deleteSale');
    if (typeof deleteSale !== 'function' || !fixture.ngZone) throw new Error('No se encontró la operación para eliminar ventas.');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const sales = Reflect.get(component, 'sales') as { id: string }[];
    fixture.ngZone.run(() => deleteSale.call(component, sales[0]));
    confirmSpy.mockRestore();
    expect(Reflect.get(component, 'sales')).toHaveLength(0);
    expect((Reflect.get(component, 'products') as { id: string; stock: number }[]).find((product) => product.id === 'p1')?.stock).toBe(34);
  });

  it('exports administrator sales in an Excel-compatible CSV and protects spreadsheet formulas', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'admin-test', 'secure-admin-test-2026');
    const component = fixture.componentInstance;
    Reflect.set(component, 'sales', [{
      id: 'export-sale',
      employeeId: 'test-ana',
      employeeName: '=Ana García',
      date: '2026-11-13T10:00:00.000Z',
      total: 18,
      items: [{ productId: 'p1', name: '=HYPERLINK("https://example.com")', price: 18, quantity: 1 }],
      paymentMethod: 'Efectivo',
      amountReceived: 20,
      changeGiven: 2,
    }]);
    const salesCsvContent = Reflect.get(component, 'salesCsvContent');
    if (typeof salesCsvContent !== 'function') throw new Error('No se encontró el generador del archivo de ventas.');
    const content = salesCsvContent.call(component) as string;
    expect(content.startsWith('\uFEFF')).toBe(true);
    expect(content).toContain('"Folio";"Fecha y hora";"Empleado"');
    expect(content).toContain("'=Ana García");
    expect(content).toContain(`"'=HYPERLINK(""https://example.com"") x1`);
    expect(content).toContain('"18.00"');
  });

  it('updates existing products and adds new products from an Excel-compatible CSV', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'admin-test', 'secure-admin-test-2026');
    const component = fixture.componentInstance;
    const currentProducts = Reflect.get(component, 'products') as { id: string; name: string; barcode?: string }[];
    Reflect.set(component, 'products', currentProducts.map((product) =>
      product.id === 'p1' ? { ...product, barcode: '111111' } : product,
    ));
    const productsButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.side-nav button'))
      .find((button) => button.textContent?.includes('Productos')) as HTMLButtonElement | undefined;
    if (!productsButton) throw new Error('No se encontró el catálogo del administrador.');
    productsButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.product-transfer-actions')).toBeTruthy();

    const csv = [
      'Nombre;Categoria;Precio;Existencias;Codigo de barras;Emoji;Descripcion',
      '"Papas clásicas";"Botanas";"19.50";"30";"111111";"🥔";"Bolsa, nueva"',
      '" GALLETAS DE CHOCOLATE ";"Galletas";"17";"14";"";"🍪";""',
      '"Jugo de mango";"Bebidas";"25";"4";"222222";"🧃";"Botella; grande"',
    ].join('\r\n');
    const file = new File([csv], 'catalogo.csv', { type: 'text/csv' });
    const input = fixture.nativeElement.querySelector('.product-import-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    const importProducts = Reflect.get(component, 'importProducts');
    if (typeof importProducts !== 'function' || !fixture.ngZone) {
      throw new Error('No se encontró la operación para importar productos.');
    }
    const importResult = fixture.ngZone.run(() => importProducts.call(component, { target: input }));
    await importResult;
    fixture.detectChanges();

    const products = Reflect.get(component, 'products') as { id: string; name: string; category: string; price: number; stock: number; barcode?: string; description: string }[];
    expect(products).toHaveLength(9);
    expect(products.find((product) => product.id === 'p1')).toMatchObject({
      name: 'Papas clásicas',
      price: 19.5,
      stock: 30,
      barcode: '111111',
      description: 'Bolsa, nueva',
    });
    expect(products.find((product) => product.id === 'p3')).toMatchObject({
      name: 'GALLETAS DE CHOCOLATE',
      price: 17,
      stock: 14,
    });
    expect(products.find((product) => product.name === 'Jugo de mango')).toMatchObject({
      category: 'Bebidas',
      barcode: '222222',
      description: 'Botella; grande',
    });
    expect((Reflect.get(component, 'categories') as string[])).toContain('Bebidas');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('1 productos agregados y 2 actualizados');
  });

  it('rejects duplicate or malformed product CSV without changing the catalog', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'admin-test', 'secure-admin-test-2026');
    const component = fixture.componentInstance;
    const productsBefore = [...Reflect.get(component, 'products') as { id: string; name: string }[]];
    const productsButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.side-nav button'))
      .find((button) => button.textContent?.includes('Productos')) as HTMLButtonElement | undefined;
    if (!productsButton) throw new Error('No se encontró el catálogo del administrador.');
    productsButton.click();
    fixture.detectChanges();
    const csv = [
      'Nombre;Categoria;Precio;Existencias',
      'Producto nuevo;Bebidas;10;5',
      'Producto repetido;Bebidas;12;-1',
    ].join('\r\n');
    const file = new File([csv], 'catalogo.csv', { type: 'text/csv' });
    const input = fixture.nativeElement.querySelector('.product-import-input') as HTMLInputElement | null;
    if (!input) throw new Error('No se encontró el selector de importación del catálogo.');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    const importProducts = Reflect.get(component, 'importProducts');
    if (typeof importProducts !== 'function' || !fixture.ngZone) {
      throw new Error('No se encontró la operación para importar productos.');
    }
    await fixture.ngZone.run(() => importProducts.call(component, { target: input }));
    fixture.detectChanges();
    expect(Reflect.get(component, 'products')).toEqual(productsBefore);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No se importó el archivo');
  });

  it('does not expose catalog import or export actions to employees', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'ana-test', 'secure-employee-test-2026');
    const productsButton = fixture.nativeElement.querySelector('.side-nav button:nth-child(2)') as HTMLButtonElement;
    productsButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.product-transfer-actions')).toBeNull();
    expect(fixture.nativeElement.querySelector('.product-import-input')).toBeNull();
  });

  it('adds a matching product to the point-of-sale cart when a barcode is scanned', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'ana-test', 'secure-employee-test-2026');

    const productsButton = fixture.nativeElement.querySelector('.side-nav button:nth-child(2)') as HTMLButtonElement;
    productsButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.barcode-scan-panel')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.recharge-provider')).toHaveLength(4);
    expect(Array.from(fixture.nativeElement.querySelectorAll('.recharge-provider'), (link: Element) => link.textContent).join(' '))
      .toContain('Telcel');
    expect(Array.from(fixture.nativeElement.querySelectorAll('.recharge-provider'), (link: Element) => link.textContent).join(' '))
      .toContain('Unefon');
    expect(Array.from(fixture.nativeElement.querySelectorAll('.recharge-provider'), (link: Element) => link.textContent).join(' '))
      .toContain('Movistar');
    expect(Array.from(fixture.nativeElement.querySelectorAll('.recharge-provider'), (link: Element) => link.textContent).join(' '))
      .toContain('BAIT');

    const component = fixture.componentInstance;
    const products = Reflect.get(component, 'products') as { id: string; barcode?: string }[];
    Reflect.set(component, 'products', products.map((product) =>
      product.id === 'p1' ? { ...product, barcode: '0123456789012' } : product,
    ));
    Reflect.set(component, 'barcodeInput', '0123456789012');
    const scanBarcode = Reflect.get(component, 'scanBarcode');
    if (typeof scanBarcode !== 'function') throw new Error('No se encontró el método para escanear productos.');
    if (!fixture.ngZone) throw new Error('La zona de pruebas no está disponible.');
    fixture.ngZone.run(() => scanBarcode.call(component));

    const cart = Reflect.get(component, 'cart') as { productId: string; quantity: number }[];
    expect(cart).toEqual([{ productId: 'p1', name: 'Papas clásicas', price: 18, quantity: 1 }]);
  });

  it('records card payments without asking for cash received', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'ana-test', 'secure-employee-test-2026');

    const productsButton = fixture.nativeElement.querySelector('.side-nav button:nth-child(2)') as HTMLButtonElement;
    productsButton.click();
    fixture.detectChanges();
    const addButton = fixture.nativeElement.querySelector('.product-card .add-cart-button') as HTMLButtonElement;
    addButton.click();
    fixture.detectChanges();
    const cardButton = fixture.nativeElement.querySelector('.payment-options button:nth-child(2)') as HTMLButtonElement;
    cardButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[name="amountReceived"]')).toBeNull();
    const checkoutButton = fixture.nativeElement.querySelector('.checkout-button') as HTMLButtonElement;
    expect(checkoutButton.disabled).toBe(false);
    checkoutButton.click();

    const saved = JSON.parse(localStorage.getItem('tienda-comercial-data') ?? '{}') as {
      sales: { paymentMethod: string; changeGiven: number }[];
    };
    expect(saved.sales[0].paymentMethod).toBe('Tarjeta');
    expect(saved.sales[0].changeGiven).toBe(0);
  });

  it('adds a phone recharge to the sale without reducing product stock', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'ana-test', 'secure-employee-test-2026');
    const productsButton = fixture.nativeElement.querySelector('.side-nav button:nth-child(2)') as HTMLButtonElement;
    productsButton.click();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const products = Reflect.get(component, 'products') as { id: string; stock: number }[];
    const addToCart = Reflect.get(component, 'addToCart');
    const addRechargeToCart = Reflect.get(component, 'addRechargeToCart');
    if (typeof addToCart !== 'function' || typeof addRechargeToCart !== 'function') {
      throw new Error('No se encontraron las operaciones de cobro.');
    }
    if (!fixture.ngZone) throw new Error('La zona de pruebas no está disponible.');
    fixture.ngZone.run(() => {
      addToCart.call(component, products[0]);
      Reflect.set(component, 'rechargeProvider', 'BAIT');
      Reflect.set(component, 'rechargeAmount', 50);
      addRechargeToCart.call(component);
      Reflect.set(component, 'paymentMethod', 'Tarjeta');
    });
    const cart = Reflect.get(component, 'cart') as { kind?: string; provider?: string; price: number }[];
    expect(cart).toHaveLength(2);
    expect(cart[1]).toMatchObject({ kind: 'recharge', provider: 'BAIT', price: 50 });

    const completeSale = Reflect.get(component, 'completeSale');
    if (typeof completeSale !== 'function') throw new Error('No se encontró el método para completar la venta.');
    fixture.ngZone.run(() => completeSale.call(component));
    const saved = JSON.parse(localStorage.getItem('tienda-comercial-data') ?? '{}') as {
      products: { id: string; stock: number }[];
      sales: { total: number; items: { kind?: string; provider?: string; price: number }[] }[];
    };
    expect(saved.sales[0].total).toBe(68);
    expect(saved.sales[0].items.find((item) => item.kind === 'recharge')).toMatchObject({ provider: 'BAIT', price: 50 });
    expect(saved.products.find((product) => product.id === 'p1')?.stock).toBe(31);
  });

  it('allows employees to add a product and send an admin deletion request', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'ana-test', 'secure-employee-test-2026');
    const productsButton = fixture.nativeElement.querySelector('.side-nav button:nth-child(2)') as HTMLButtonElement;
    productsButton.click();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const productDraft = {
      id: '',
      name: 'Jugo de naranja',
      category: 'Bebidas',
      price: 25,
      stock: 8,
      emoji: '🧃',
      description: 'Botella',
      barcode: '9876543210',
    };
    Reflect.set(component, 'productDraft', productDraft);
    const saveProduct = Reflect.get(component, 'saveProduct');
    if (typeof saveProduct !== 'function') throw new Error('No se encontró el método para guardar productos.');
    if (!fixture.ngZone) throw new Error('La zona de pruebas no está disponible.');
    fixture.ngZone.run(() => saveProduct.call(component));
    expect((Reflect.get(component, 'products') as { name: string }[]).some((item) => item.name === 'Jugo de naranja')).toBe(true);

    const products = Reflect.get(component, 'products') as { id: string; name: string }[];
    const requestProductDeletion = Reflect.get(component, 'requestProductDeletion');
    const sendProductDeletionRequest = Reflect.get(component, 'sendProductDeletionRequest');
    if (typeof requestProductDeletion !== 'function' || typeof sendProductDeletionRequest !== 'function') {
      throw new Error('No se encontraron las operaciones de solicitud de eliminación.');
    }
    fixture.ngZone.run(() => {
      requestProductDeletion.call(component, products.find((item) => item.name === 'Jugo de naranja'));
      Reflect.set(component, 'deletionRequestMessage', 'Producto duplicado');
      sendProductDeletionRequest.call(component, products.find((item) => item.name === 'Jugo de naranja'));
    });
    const saved = JSON.parse(localStorage.getItem('tienda-comercial-data') ?? '{}') as {
      deletionRequests: { productName: string; message: string }[];
    };
    expect(saved.deletionRequests).toHaveLength(1);
    expect(saved.deletionRequests[0]).toMatchObject({ productName: 'Jugo de naranja', message: 'Producto duplicado' });

    const adminFixture = TestBed.createComponent(App);
    adminFixture.detectChanges();
    await signIn(adminFixture, 'admin-test', 'secure-admin-test-2026');
    const adminElement = adminFixture.nativeElement as HTMLElement;
    const requestsButton = Array.from(adminElement.querySelectorAll('.side-nav button'))
      .find((button) => button.textContent?.includes('Solicitudes')) as HTMLButtonElement | undefined;
    if (!requestsButton) throw new Error('No se encontró la bandeja de solicitudes del administrador.');
    requestsButton.click();
    adminFixture.detectChanges();
    expect(adminElement.textContent).toContain('Producto duplicado');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const approveButton = adminElement.querySelector('.request-approve-button') as HTMLButtonElement;
    approveButton.click();
    confirmSpy.mockRestore();
    const updated = JSON.parse(localStorage.getItem('tienda-comercial-data') ?? '{}') as {
      products: { name: string }[];
      deletionRequests: { productName: string }[];
    };
    expect(updated.products.some((product) => product.name === 'Jugo de naranja')).toBe(false);
    expect(updated.deletionRequests).toHaveLength(0);
  });

  it('allows administrators to edit employee details', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'admin-test', 'secure-admin-test-2026');
    const teamButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.side-nav button'))
      .find((button) => button.textContent?.includes('Equipo')) as HTMLButtonElement | undefined;
    if (!teamButton) throw new Error('No se encontró el acceso a la gestión del equipo.');
    teamButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.team-edit-button')).toBeTruthy();

    const component = fixture.componentInstance;
    const employees = Reflect.get(component, 'employees') as { id: string; name: string; username: string; password: string; role: string }[];
    const editEmployee = Reflect.get(component, 'editEmployee');
    const saveEmployee = Reflect.get(component, 'saveEmployee');
    if (typeof editEmployee !== 'function' || typeof saveEmployee !== 'function') {
      throw new Error('No se encontraron las operaciones para editar empleados.');
    }
    if (!fixture.ngZone) throw new Error('La zona de pruebas no está disponible.');
    fixture.ngZone.run(() => {
      editEmployee.call(component, employees.find((employee) => employee.username === 'ana-test'));
      Reflect.set(component, 'employeeDraft', {
        name: 'Ana García López',
        username: 'ana.garcia',
        password: 'empleado-seguro-2026',
        role: 'Empleado',
        scheduleStart: '08:00',
        scheduleEnd: '17:00',
      });
      saveEmployee.call(component);
    });
    expect((Reflect.get(component, 'employees') as { name: string; username: string }[])
      .find((employee) => employee.username === 'ana.garcia')).toMatchObject({
      name: 'Ana García López',
      scheduleStart: '08:00',
      scheduleEnd: '17:00',
    });
  });

  it('limits camera settings to administrators and saves only local camera addresses', async () => {
    const employeeFixture = TestBed.createComponent(App);
    employeeFixture.detectChanges();
    await signIn(employeeFixture, 'ana-test', 'secure-employee-test-2026');
    expect(employeeFixture.nativeElement.querySelector('.side-nav').textContent).not.toContain('Cámaras');
    const employeeNavigate = Reflect.get(employeeFixture.componentInstance, 'navigate');
    if (typeof employeeNavigate !== 'function' || !employeeFixture.ngZone) throw new Error('No se pudo verificar el acceso a cámaras.');
    employeeFixture.ngZone.run(() => employeeNavigate.call(employeeFixture.componentInstance, 'camaras'));
    expect(Reflect.get(employeeFixture.componentInstance, 'activeSection')).not.toBe('camaras');
    employeeFixture.ngZone.run(() => employeeNavigate.call(employeeFixture.componentInstance, 'cortes'));
    expect(Reflect.get(employeeFixture.componentInstance, 'activeSection')).not.toBe('cortes');

    const adminFixture = TestBed.createComponent(App);
    adminFixture.detectChanges();
    await signIn(adminFixture, 'admin-test', 'secure-admin-test-2026');
    const adminElement = adminFixture.nativeElement as HTMLElement;
    const cameraButton = Array.from(adminElement.querySelectorAll('.side-nav button'))
      .find((button) => button.textContent?.includes('Cámaras')) as HTMLButtonElement | undefined;
    if (!cameraButton) throw new Error('No se encontró el acceso administrativo a las cámaras.');
    cameraButton.click();
    adminFixture.detectChanges();
    expect(Reflect.get(adminFixture.componentInstance, 'activeSection')).toBe('camaras');
    expect(Reflect.get(adminFixture.componentInstance, 'isAdmin')).toBe(true);
    expect(adminFixture.nativeElement.querySelector('.camera-settings-panel')).toBeTruthy();
    expect(adminFixture.nativeElement.querySelector('.camera-lens')).toBeTruthy();
    expect((adminFixture.nativeElement as HTMLElement).textContent).toContain('Vista previa no disponible');
    const adminComponent = adminFixture.componentInstance;
    Reflect.set(adminComponent, 'cameraDraft', { name: 'DVR tienda', address: '192.168.1.50:8080' });
    const saveCameraSettings = Reflect.get(adminComponent, 'saveCameraSettings');
    if (typeof saveCameraSettings !== 'function') throw new Error('No se encontró el método para guardar cámaras.');
    if (!adminFixture.ngZone) throw new Error('La zona de pruebas no está disponible.');
    adminFixture.ngZone.run(() => saveCameraSettings.call(adminComponent));
    expect(Reflect.get(adminComponent, 'cameraSettings')).toEqual({
      name: 'DVR tienda',
      address: 'http://192.168.1.50:8080/',
    });
    Reflect.set(adminComponent, 'cameraDraft', { name: 'DVR en Tailscale', address: '100.100.20.5:8080' });
    adminFixture.ngZone.run(() => saveCameraSettings.call(adminComponent));
    expect(Reflect.get(adminComponent, 'cameraSettings')).toEqual({
      name: 'DVR en Tailscale',
      address: 'http://100.100.20.5:8080/',
    });
    Reflect.set(adminComponent, 'cameraDraft', { name: 'DVR público', address: 'https://example.com/camera' });
    adminFixture.ngZone.run(() => saveCameraSettings.call(adminComponent));
    expect(Reflect.get(adminComponent, 'cameraSettings')).toEqual({
      name: 'DVR en Tailscale',
      address: 'http://100.100.20.5:8080/',
    });
  });

  it('does not allow administrators to add products to a sale', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await signIn(fixture, 'admin-test', 'secure-admin-test-2026');

    const productsButton = fixture.nativeElement.querySelector('.side-nav button:nth-child(2)') as HTMLButtonElement;
    productsButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.add-cart-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cart-panel')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Agregar producto');

    const component = fixture.componentInstance;
    const products = Reflect.get(component, 'products') as { id: string; stock: number }[];
    const addToCart = Reflect.get(component, 'addToCart');
    const completeSale = Reflect.get(component, 'completeSale');
    if (typeof addToCart !== 'function' || typeof completeSale !== 'function') {
      throw new Error('No se encontraron las operaciones de venta.');
    }
    if (!fixture.ngZone) throw new Error('La zona de pruebas no está disponible.');
    fixture.ngZone.run(() => {
      addToCart.call(component, products[0]);
      completeSale.call(component);
    });

    expect(Reflect.get(component, 'cart')).toHaveLength(0);
    expect(Reflect.get(component, 'sales')).toHaveLength(0);
    expect((JSON.parse(localStorage.getItem('tienda-comercial-data') ?? '{"sales":[]}') as { sales: unknown[] }).sales).toHaveLength(0);
  });
});
