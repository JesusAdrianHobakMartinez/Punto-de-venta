import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';

type Role = 'Administrador' | 'Empleado';
type Section = 'inicio' | 'productos' | 'ventas' | 'reportes' | 'equipo' | 'categorias' | 'solicitudes' | 'camaras' | 'cortes' | 'conexion';
type PaymentMethod = 'Efectivo' | 'Tarjeta';

interface StoreConnectionInfo {
  addresses: string[];
  tailscaleAddresses: string[];
  port: number;
  token: string;
}

interface IssuedConnectionKey {
  id: string;
  name: string;
}

interface GeneratedConnectionKey extends IssuedConnectionKey {
  token: string;
}

interface SharedStoreResponse {
  data: StoreData | null;
  revision: number;
}

interface PendingStoreSave {
  data: StoreData;
  revision: number;
}

interface RechargeProvider {
  name: string;
  url: string;
  className: string;
}

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  emoji: string;
  description: string;
  barcode?: string;
}

interface ImportedProduct {
  name: string;
  category: string;
  price: number;
  stock: number;
  barcode: string;
  emoji: string;
  description: string;
  hasBarcodeColumn: boolean;
  hasEmojiColumn: boolean;
  hasDescriptionColumn: boolean;
}

interface ProductDeletionRequest {
  id: string;
  productId: string;
  productName: string;
  employeeId: string;
  employeeName: string;
  message: string;
  date: string;
}

interface CameraSettings {
  address: string;
  name: string;
}

interface Employee {
  id: string;
  name: string;
  username: string;
  password: string;
  role: Role;
  scheduleStart?: string;
  scheduleEnd?: string;
}

interface EmployeeShift {
  id: string;
  employeeId: string;
  employeeName: string;
  scheduleStart?: string;
  scheduleEnd?: string;
  startedAt: string;
  openingCash?: number;
  status: 'open' | 'closed';
  endedAt?: string;
  expectedTotal?: number;
  cashCounted?: number;
  cardReceipts?: number;
  countedTotal?: number;
  difference?: number;
  denominations?: Record<string, number>;
  salesCount?: number;
  adminViewed?: boolean;
}

interface DailyCashEntry {
  id: string;
  employeeName: string;
  date: string;
  type: 'opening' | 'closing';
  amount: number;
  description: string;
}

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  kind?: 'product' | 'recharge';
  provider?: string;
}

interface Sale {
  id: string;
  employeeId: string;
  employeeName: string;
  shiftId?: string;
  date: string;
  total: number;
  items: CartItem[];
  paymentMethod?: PaymentMethod;
  amountReceived?: number;
  changeGiven?: number;
}

interface StoreData {
  products: Product[];
  categories: string[];
  employees: Employee[];
  sales: Sale[];
  deletionRequests?: ProductDeletionRequest[];
  cameraSettings?: CameraSettings;
  shifts?: EmployeeShift[];
}

@Component({
  imports: [CurrencyPipe, DatePipe, FormsModule],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly storageKey = 'tienda-comercial-data';
  protected readonly isMobileApp = Capacitor.isNativePlatform();
  protected readonly isDesktopApp = typeof window !== 'undefined' && window.location.protocol === 'file:';
  protected mobileServerUrl = localStorage.getItem('tienda-sync-server') ?? '';
  protected mobileSyncToken = localStorage.getItem('tienda-sync-token') ?? '';
  protected desktopServerUrl = localStorage.getItem('tienda-desktop-server') ?? '';
  protected desktopSyncToken = localStorage.getItem('tienda-desktop-token') ?? '';
  protected storeConnected = false;
  protected connectionBusy = false;
  protected connectionStatus = '';
  protected connectionInfo: StoreConnectionInfo | null = null;
  protected connectionKeyName = '';
  protected connectionKeys: IssuedConnectionKey[] = [];
  protected generatedConnectionKey: GeneratedConnectionKey | null = null;
  protected connectionKeyBusy = false;
  private serverRevision = 0;
  private pendingSyncs = 0;
  private syncQueue: Promise<void> = Promise.resolve();
  private pollHandle: number | null = null;

  protected readonly cashDenominations = [
    { value: 1000, label: '$1,000' },
    { value: 500, label: '$500' },
    { value: 200, label: '$200' },
    { value: 100, label: '$100' },
    { value: 50, label: '$50' },
    { value: 20, label: '$20' },
    { value: 10, label: '$10' },
    { value: 5, label: '$5' },
    { value: 2, label: '$2' },
    { value: 1, label: '$1' },
    { value: 0.5, label: '$0.50' },
  ];

  protected readonly demoProducts: Product[] = [
    { id: 'p1', name: 'Papas clásicas', category: 'Botanas', price: 18, stock: 32, emoji: '🥔', description: 'Bolsa individual · 45 g' },
    { id: 'p2', name: 'Refresco de cola', category: 'Bebidas', price: 22, stock: 24, emoji: '🥤', description: 'Botella · 600 ml' },
    { id: 'p3', name: 'Galletas de chocolate', category: 'Galletas', price: 16, stock: 18, emoji: '🍪', description: 'Paquete · 6 piezas' },
    { id: 'p4', name: 'Detergente para ropa', category: 'Limpieza', price: 48, stock: 12, emoji: '🧼', description: 'Bolsa · 1 kg' },
    { id: 'p5', name: 'Arroz blanco', category: 'Despensa', price: 28, stock: 20, emoji: '🍚', description: 'Bolsa · 1 kg' },
    { id: 'p6', name: 'Jabón de manos', category: 'Higiene', price: 24, stock: 15, emoji: '🫧', description: 'Botella · 500 ml' },
    { id: 'p7', name: 'Agua natural', category: 'Bebidas', price: 14, stock: 40, emoji: '💧', description: 'Botella · 1 litro' },
    { id: 'p8', name: 'Galletas saladas', category: 'Galletas', price: 19, stock: 3, emoji: '🥨', description: 'Paquete familiar' },
  ];

  protected readonly rechargeProviders: RechargeProvider[] = [
    { name: 'Telcel', url: 'https://www.telcel.com/tienda/recarga-saldo', className: 'telcel' },
    { name: 'Unefon', url: 'https://miunefonweb.unefon.com.mx/', className: 'unefon' },
    { name: 'Movistar', url: 'https://mi.movistar.com.mx/recargas-online', className: 'movistar' },
    { name: 'BAIT', url: 'https://mibait.com/recargas', className: 'bait' },
  ];

  protected products: Product[] = this.demoProducts.map((product) => ({ ...product }));
  protected categories = ['Botanas', 'Bebidas', 'Galletas', 'Limpieza', 'Despensa', 'Higiene'];
  protected employees: Employee[] = [];
  protected sales: Sale[] = [];
  protected shifts: EmployeeShift[] = [];
  protected deletionRequests: ProductDeletionRequest[] = [];
  protected cameraSettings: CameraSettings = { address: '', name: 'Cámara de la tienda' };
  protected currentUser: Employee | null = null;
  protected activeSection: Section = 'inicio';
  protected searchTerm = '';
  protected barcodeInput = '';
  protected selectedCategory = 'Todas';
  protected loginUsername = '';
  protected loginPassword = '';
  protected initialAdminName = '';
  protected initialAdminUsername = '';
  protected initialAdminPassword = '';
  protected confirmAdminPassword = '';
  protected needsAdminSetup = true;
  protected message = '';
  protected cart: CartItem[] = [];
  protected paymentMethod: PaymentMethod = 'Efectivo';
  protected amountReceived = 0;
  protected rechargeProvider = 'Telcel';
  protected rechargeAmount = 0;
  protected showProductForm = false;
  protected editingProductId: string | null = null;
  protected editingEmployeeId: string | null = null;
  protected productDeletionRequestId: string | null = null;
  protected deletionRequestMessage = '';
  protected employeeDraft = this.emptyEmployee();
  protected cameraDraft: CameraSettings = { ...this.cameraSettings };
  protected productDraft = this.emptyProduct();
  protected newCategory = '';
  protected activeShiftId: string | null = null;
  protected showShiftOpening = false;
  protected shiftOpeningAmount = 0;
  protected cashClosingShiftId: string | null = null;
  protected showCashClosing = false;
  protected cashCounts: Record<string, number> = {};
  protected cardReceiptTotal = 0;

  constructor() {
    this.loadData();
    if (this.isDesktopApp) {
      if (this.isRemoteDesktopClient) {
        this.mobileServerUrl = this.desktopServerUrl;
        this.mobileSyncToken = this.desktopSyncToken;
        void this.connectStore();
      } else {
        void this.connectDesktopStore();
      }
    } else if (this.isMobileApp && this.mobileServerUrl && this.mobileSyncToken) {
      void this.connectStore();
    }
  }

  protected get isRemoteDesktopClient(): boolean {
    return this.isDesktopApp && Boolean(this.desktopServerUrl && this.desktopSyncToken);
  }

  protected get isAdmin(): boolean {
    return this.currentUser?.role === 'Administrador';
  }

  protected get pendingDeletionRequests(): ProductDeletionRequest[] {
    return this.deletionRequests.filter((request) =>
      this.products.some((product) => product.id === request.productId),
    );
  }

  protected get currentShift(): EmployeeShift | undefined {
    return this.shifts.find((shift) => shift.id === this.activeShiftId && shift.status === 'open');
  }

  protected get currentShiftSales(): Sale[] {
    return this.currentShift ? this.salesForShift(this.currentShift) : [];
  }

  protected get currentShiftSalesTotal(): number {
    return this.roundCurrency(this.currentShiftSales.reduce((sum, sale) => sum + sale.total, 0));
  }

  protected get currentShiftOpeningCash(): number {
    return this.currentShift?.openingCash ?? 0;
  }

  protected get currentShiftCashExpected(): number {
    return this.roundCurrency(this.currentShiftSales
      .filter((sale) => sale.paymentMethod === 'Efectivo')
      .reduce((sum, sale) => sum + sale.total, 0));
  }

  protected get currentShiftCardExpected(): number {
    return this.roundCurrency(this.currentShiftSales
      .filter((sale) => sale.paymentMethod === 'Tarjeta')
      .reduce((sum, sale) => sum + sale.total, 0));
  }

  protected get cashClosingShift(): EmployeeShift | undefined {
    return this.shifts.find((shift) => shift.id === this.cashClosingShiftId);
  }

  protected get cashCountTotal(): number {
    return this.roundCurrency(this.cashDenominations.reduce((total, denomination) =>
      total + denomination.value * Number(this.cashCounts[String(denomination.value)] || 0), 0));
  }

  protected get cashClosingDifference(): number {
    const shift = this.cashClosingShift;
    const expectedSales = shift?.id === this.currentShift?.id
      ? this.currentShiftSalesTotal
      : this.salesForShift(shift).reduce((sum, sale) => sum + sale.total, 0);
    return this.roundCurrency(this.cashCountTotal + Number(this.cardReceiptTotal || 0)
      - expectedSales - (shift?.openingCash ?? 0));
  }

  protected get pendingCashClosingNotifications(): number {
    return this.shifts.filter((shift) => shift.status === 'closed' && !shift.adminViewed).length;
  }

  protected get filteredProducts(): Product[] {
    const query = this.searchTerm.trim().toLocaleLowerCase();
    return this.products.filter((product) => {
      const matchesCategory = this.selectedCategory === 'Todas' || product.category === this.selectedCategory;
      const matchesSearch = !query || `${product.name} ${product.category}`.toLocaleLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }

  protected get visibleSales(): Sale[] {
    if (this.isAdmin) return [...this.sales].sort((a, b) => b.date.localeCompare(a.date));
    return this.sales.filter((sale) => sale.employeeId === this.currentUser?.id).sort((a, b) => b.date.localeCompare(a.date));
  }

  protected get cartTotal(): number {
    return this.cart.reduce((total, item) => total + item.price * item.quantity, 0);
  }

  protected get cartCount(): number {
    return this.cart.reduce((total, item) => total + item.quantity, 0);
  }

  protected get changeDue(): number {
    return Math.max(0, this.amountReceived - this.cartTotal);
  }

  protected get cashPaymentShortfall(): boolean {
    return this.paymentMethod === 'Efectivo' && this.amountReceived < this.cartTotal;
  }

  protected get totalRevenue(): number {
    return this.sales.reduce((total, sale) => total + sale.total, 0);
  }

  protected get mySalesTotal(): number {
    return this.currentUser
      ? this.salesForEmployee(this.currentUser.id).reduce((total, sale) => total + sale.total, 0)
      : 0;
  }

  protected get visibleSalesTotal(): number {
    return this.visibleSales.reduce((total, sale) => total + sale.total, 0);
  }

  protected get employeeCount(): number {
    return this.employees.filter((employee) => employee.role === 'Empleado').length;
  }

  protected get todaySales(): Sale[] {
    const today = this.localDateKey(new Date());
    return this.sales.filter((sale) => this.localDateKey(new Date(sale.date)) === today);
  }

  protected get todayRevenue(): number {
    return this.todaySales.reduce((total, sale) => total + sale.total, 0);
  }

  protected get dailyCashEntries(): DailyCashEntry[] {
    const today = this.localDateKey(new Date());
    const entries: DailyCashEntry[] = [];
    for (const shift of this.shifts) {
      if (this.localDateKey(new Date(shift.startedAt)) === today) {
        entries.push({
          id: `${shift.id}-opening`,
          employeeName: shift.employeeName,
          date: shift.startedAt,
          type: 'opening',
          amount: shift.openingCash ?? 0,
          description: 'Fondo inicial del turno',
        });
      }
      if (shift.status === 'closed' && shift.endedAt
        && this.localDateKey(new Date(shift.endedAt)) === today) {
        const openingCash = shift.openingCash ?? 0;
        const cashCounted = shift.cashCounted ?? 0;
        entries.push({
          id: `${shift.id}-closing`,
          employeeName: shift.employeeName,
          date: shift.endedAt,
          type: 'closing',
          amount: this.roundCurrency(cashCounted - openingCash),
          description: `Efectivo neto del corte · contado ${this.formatCurrency(cashCounted)} menos fondo inicial ${this.formatCurrency(openingCash)}`,
        });
      }
    }
    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }

  protected get todayOpeningCash(): number {
    return this.roundCurrency(this.dailyCashEntries
      .filter((entry) => entry.type === 'opening')
      .reduce((total, entry) => total + entry.amount, 0));
  }

  protected get todayCashCuts(): number {
    return this.roundCurrency(this.dailyCashEntries
      .filter((entry) => entry.type === 'closing')
      .reduce((total, entry) => total + entry.amount, 0));
  }

  protected get todayCashRegisterTotal(): number {
    return this.roundCurrency(this.todayOpeningCash + this.todayCashCuts);
  }

  protected get todayDateLabel(): string {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'full' }).format(new Date());
  }

  protected get employeeSummaries(): { employee: Employee; count: number; total: number }[] {
    return this.employees
      .filter((employee) => employee.role === 'Empleado')
      .map((employee) => {
        const employeeSales = this.sales.filter((sale) => sale.employeeId === employee.id);
        return {
          employee,
          count: employeeSales.length,
          total: employeeSales.reduce((total, sale) => total + sale.total, 0),
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  protected get lowStockCount(): number {
    return this.products.filter((product) => product.stock <= 5).length;
  }

  protected navigate(section: Section): void {
    if (!this.isAdmin && ['reportes', 'equipo', 'categorias', 'solicitudes', 'camaras', 'cortes'].includes(section)) return;
    if (!this.isAdmin && section === 'conexion' && !this.isMobileApp) return;
    this.activeSection = section;
    this.message = '';
    if (this.isAdmin && section === 'cortes' && this.pendingCashClosingNotifications) {
      this.shifts = this.shifts.map((shift) =>
        shift.status === 'closed' ? { ...shift, adminViewed: true } : shift,
      );
      this.persistData();
    }
  }

  protected login(): void {
    if (!this.canUseSharedStore()) return;
    if (this.needsAdminSetup) return;
    const user = this.employees.find(
      (employee) => employee.username.toLocaleLowerCase() === this.loginUsername.trim().toLocaleLowerCase()
        && employee.password === this.loginPassword,
    );
    if (!user) {
      this.message = 'Usuario o contraseña incorrectos.';
      return;
    }
    this.currentUser = user;
    this.activeSection = 'inicio';
    this.message = '';
    this.loginPassword = '';
    if (user.role === 'Empleado') {
      const openShift = this.shifts
        .filter((shift) => shift.employeeId === user.id && shift.status === 'open')
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
      if (openShift) {
        this.activeShiftId = openShift.id;
      } else {
        this.showShiftOpening = true;
        this.shiftOpeningAmount = 0;
        this.activeShiftId = null;
      }
    } else {
      this.activeShiftId = null;
    }
  }

  protected startEmployeeShift(): void {
    if (!this.showShiftOpening || !this.currentUser || this.currentUser.role !== 'Empleado') return;
    const openingCash = Number(this.shiftOpeningAmount);
    if (!Number.isFinite(openingCash) || openingCash < 0) {
      this.message = 'Ingresa un fondo inicial válido, igual o mayor a cero.';
      return;
    }
    const shift: EmployeeShift = {
      id: this.createId(),
      employeeId: this.currentUser.id,
      employeeName: this.currentUser.name,
      scheduleStart: this.currentUser.scheduleStart,
      scheduleEnd: this.currentUser.scheduleEnd,
      startedAt: new Date().toISOString(),
      openingCash: this.roundCurrency(openingCash),
      status: 'open',
    };
    const previousShifts = this.shifts;
    this.shifts = [...this.shifts, shift];
    if (!this.persistData()) {
      this.shifts = previousShifts;
      return;
    }
    this.activeShiftId = shift.id;
    this.showShiftOpening = false;
    this.shiftOpeningAmount = 0;
    this.message = '';
  }

  protected createInitialAdmin(): void {
    if (!this.canUseSharedStore()) return;
    if (!this.needsAdminSetup || this.employees.some((employee) => employee.role === 'Administrador')) return;
    const name = this.initialAdminName.trim();
    const username = this.initialAdminUsername.trim();
    if (!name || !username) {
      this.message = 'Escribe el nombre y usuario del administrador.';
      return;
    }
    if (this.initialAdminPassword.length < 10) {
      this.message = 'La contraseña debe tener al menos 10 caracteres.';
      return;
    }
    if (this.initialAdminPassword !== this.confirmAdminPassword) {
      this.message = 'Las contraseñas no coinciden.';
      return;
    }
    if (this.employees.some((employee) => employee.username.toLocaleLowerCase() === username.toLocaleLowerCase())) {
      this.message = 'Ese nombre de usuario ya está registrado.';
      return;
    }
    const admin: Employee = {
      id: this.createId(),
      name,
      username,
      password: this.initialAdminPassword,
      role: 'Administrador',
    };
    this.employees = [...this.employees, admin];
    this.needsAdminSetup = false;
    this.currentUser = admin;
    this.initialAdminName = '';
    this.initialAdminUsername = '';
    this.initialAdminPassword = '';
    this.confirmAdminPassword = '';
    this.activeSection = 'inicio';
    this.persistData();
  }

  protected logout(): void {
    if (!this.isAdmin) {
      const shift = this.currentShift;
      if (!shift) {
        this.message = 'No se encontró el turno abierto. Contacta al administrador antes de salir.';
        return;
      }
      this.cashClosingShiftId = shift.id;
      this.showCashClosing = true;
      this.cashCounts = Object.fromEntries(this.cashDenominations.map(({ value }) => [String(value), 0]));
      this.cardReceiptTotal = 0;
      return;
    }
    this.finishLogout();
  }

  protected async connectStore(): Promise<void> {
    if (this.connectionBusy) return;
    this.connectionBusy = true;
    this.connectionStatus = 'Conectando con la tienda...';
    let shouldRetry = false;
    try {
      const enteredUrl = this.isDesktopApp ? this.desktopServerUrl : this.mobileServerUrl;
      const enteredToken = this.isDesktopApp ? this.desktopSyncToken : this.mobileSyncToken;
      const baseUrl = this.normalizeServerUrl(enteredUrl);
      const token = enteredToken.trim();
      if (!token) throw new Error('Escribe la clave de conexión que aparece en la computadora principal.');
      this.mobileServerUrl = baseUrl;
      this.mobileSyncToken = token;
      if (this.isDesktopApp) {
        this.desktopServerUrl = baseUrl;
        this.desktopSyncToken = token;
        localStorage.setItem('tienda-desktop-server', baseUrl);
        localStorage.setItem('tienda-desktop-token', token);
      } else {
        localStorage.setItem('tienda-sync-server', baseUrl);
        localStorage.setItem('tienda-sync-token', token);
      }
      shouldRetry = true;
      const remote = await this.fetchSharedStore(baseUrl, token);
      if (!remote.data) {
        throw new Error('Primero abre la aplicación de escritorio y espera a que inicialice los datos compartidos.');
      }
      const pending = this.readPendingStoreSave();
      if (pending && pending.revision !== remote.revision) {
        throw new Error('Hay cambios locales pendientes y la tienda principal también cambió. Se conservaron los datos de este equipo; pide al administrador que revise ambos dispositivos.');
      }
      this.serverRevision = remote.revision;
      this.storeConnected = true;
      if (pending) {
        this.applyStoreData(pending.data);
        this.queueSharedStoreSave(pending.data);
        this.connectionStatus = 'Enviando los cambios pendientes a la tienda principal...';
      } else {
        this.applyStoreData(remote.data);
        this.connectionStatus = 'Conectado a la tienda principal.';
      }
    } catch (error) {
      this.storeConnected = false;
      this.connectionStatus = error instanceof Error ? error.message : 'No se pudo conectar con la tienda.';
    } finally {
      this.connectionBusy = false;
      if (shouldRetry) this.startStorePolling();
      this.changeDetector.markForCheck();
    }
  }

  private async connectDesktopStore(): Promise<void> {
    try {
      const connectionResponse = await fetch('http://127.0.0.1:43827/api/connection');
      if (!connectionResponse.ok) throw new Error('No se pudo consultar la conexión de la computadora principal.');
      this.connectionInfo = await connectionResponse.json() as StoreConnectionInfo;
      this.mobileServerUrl = `http://127.0.0.1:${this.connectionInfo.port}`;
      this.mobileSyncToken = this.connectionInfo.token;
      const remote = await this.fetchSharedStore(this.mobileServerUrl, this.mobileSyncToken);
      const pending = this.readPendingStoreSave();
      if (pending && pending.revision !== remote.revision) {
        throw new Error('Hay cambios locales pendientes y la tienda compartida también cambió. Se conservaron los datos locales; revisa ambos dispositivos antes de sincronizar.');
      }
      if (pending) {
        this.serverRevision = remote.revision;
        this.applyStoreData(pending.data);
        this.storeConnected = true;
        this.queueSharedStoreSave(pending.data);
      } else if (remote.data) {
        this.applyStoreData(remote.data);
      } else {
        const response = await fetch(`${this.mobileServerUrl}/api/store`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${this.mobileSyncToken}`,
            'Content-Type': 'application/json',
            'If-Match': String(remote.revision),
          },
          body: JSON.stringify(this.createStoreData()),
        });
        if (!response.ok) throw new Error(await this.readServerError(response));
        const result = await response.json() as { revision: number };
        this.serverRevision = result.revision;
      }
      if (remote.data && !pending) this.serverRevision = remote.revision;
      this.storeConnected = true;
      this.connectionStatus = 'Sincronización local activa.';
      await this.loadConnectionKeys();
      this.startStorePolling();
    } catch (error) {
      this.storeConnected = false;
      this.connectionStatus = error instanceof Error ? error.message : 'No se pudo iniciar la sincronización local.';
      this.message = `Sin sincronización: ${this.connectionStatus}`;
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  private canUseSharedStore(): boolean {
    if ((this.isMobileApp || this.isDesktopApp) && !this.storeConnected) {
      this.message = 'Conecta con la computadora principal para consultar y guardar los datos compartidos.';
      return false;
    }
    return true;
  }

  private normalizeServerUrl(value: string): string {
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      throw new Error('Escribe una dirección válida, por ejemplo http://192.168.1.20:43827.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
      throw new Error('La dirección debe contener solo el protocolo, IP y puerto del servidor.');
    }
    return url.origin;
  }

  private async fetchSharedStore(baseUrl: string, token: string): Promise<SharedStoreResponse> {
    const response = await fetch(`${baseUrl}/api/store`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(await this.readServerError(response));
    const remote = await response.json() as SharedStoreResponse;
    if (!Number.isInteger(remote.revision) || remote.revision < 0
      || (remote.data !== null && !this.isValidStoreData(remote.data))) {
      throw new Error('El servidor devolvió datos de tienda con formato no válido.');
    }
    return remote;
  }

  private async loadConnectionKeys(): Promise<void> {
    const response = await fetch(`http://127.0.0.1:${this.connectionInfo?.port ?? 43827}/api/connection/keys`);
    if (!response.ok) throw new Error(await this.readServerError(response));
    const keys = await response.json() as IssuedConnectionKey[];
    if (!Array.isArray(keys) || keys.some((key) =>
      !key || typeof key.id !== 'string' || typeof key.name !== 'string')) {
      throw new Error('El servidor devolvió una lista de claves con formato no válido.');
    }
    this.connectionKeys = keys;
  }

  protected async generateConnectionKey(): Promise<void> {
    if (!this.isDesktopApp || this.isRemoteDesktopClient || !this.isAdmin || this.connectionKeyBusy) return;
    this.connectionKeyBusy = true;
    try {
      const response = await fetch(`http://127.0.0.1:${this.connectionInfo?.port ?? 43827}/api/connection/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.connectionKeyName }),
      });
      if (!response.ok) throw new Error(await this.readServerError(response));
      const key = await response.json() as GeneratedConnectionKey;
      if (!key || typeof key.id !== 'string' || typeof key.name !== 'string' || typeof key.token !== 'string') {
        throw new Error('El servidor devolvió una clave con formato no válido.');
      }
      this.generatedConnectionKey = key;
      this.connectionKeyName = '';
      this.connectionStatus = `Clave única generada para ${key.name}.`;
      await this.loadConnectionKeys();
    } catch (error) {
      this.connectionStatus = error instanceof Error ? error.message : 'No se pudo generar la clave de conexión.';
    } finally {
      this.connectionKeyBusy = false;
      this.changeDetector.markForCheck();
    }
  }

  protected async revokeConnectionKey(key: IssuedConnectionKey): Promise<void> {
    if (!this.isDesktopApp || this.isRemoteDesktopClient || !this.isAdmin || this.connectionKeyBusy) return;
    if (!window.confirm(`¿Revocar la clave de conexión de "${key.name}"? Ese equipo dejará de sincronizarse.`)) return;
    this.connectionKeyBusy = true;
    try {
      const response = await fetch(`http://127.0.0.1:${this.connectionInfo?.port ?? 43827}/api/connection/keys/${encodeURIComponent(key.id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error(await this.readServerError(response));
      if (this.generatedConnectionKey?.id === key.id) this.generatedConnectionKey = null;
      await this.loadConnectionKeys();
      this.connectionStatus = `Se revocó la clave de ${key.name}.`;
    } catch (error) {
      this.connectionStatus = error instanceof Error ? error.message : 'No se pudo revocar la clave de conexión.';
    } finally {
      this.connectionKeyBusy = false;
      this.changeDetector.markForCheck();
    }
  }

  private async readServerError(response: Response): Promise<string> {
    try {
      const body = await response.json() as { error?: string };
      return body.error || `Error del servidor (${response.status}).`;
    } catch {
      return `Error del servidor (${response.status}).`;
    }
  }

  private startStorePolling(): void {
    if (this.pollHandle !== null) return;
    this.pollHandle = window.setInterval(() => void this.refreshSharedStore(), 4000);
  }

  private async refreshSharedStore(): Promise<void> {
    if (this.pendingSyncs > 0) return;
    try {
      const remote = await this.fetchSharedStore(this.mobileServerUrl, this.mobileSyncToken);
      if (this.pendingSyncs > 0) return;
      if (!remote.data) {
        this.storeConnected = false;
        this.connectionStatus = 'La tienda principal aún no inicializa los datos compartidos.';
        return;
      }
      const pending = this.readPendingStoreSave();
      if (pending) {
        if (pending.revision !== remote.revision) {
          this.storeConnected = false;
          this.connectionStatus = 'Hay cambios locales pendientes y la tienda principal también cambió. Se conservaron los datos de este teléfono; revisa ambos dispositivos antes de sincronizar.';
          return;
        }
        this.serverRevision = remote.revision;
        this.storeConnected = true;
        this.connectionStatus = 'Reintentando enviar los cambios pendientes a la tienda principal...';
        this.queueSharedStoreSave(pending.data);
        return;
      }
      const wasConnected = this.storeConnected;
      this.storeConnected = true;
      if (remote.revision === this.serverRevision) {
        if (!wasConnected) this.connectionStatus = 'Conectado a la tienda principal.';
        return;
      }
      this.applyStoreData(remote.data);
      this.serverRevision = remote.revision;
      localStorage.setItem(this.storageKey, JSON.stringify(remote.data));
      this.connectionStatus = 'Datos actualizados desde la tienda principal.';
    } catch (error) {
      this.storeConnected = false;
      this.connectionStatus = error instanceof Error ? error.message : 'Se perdió la conexión con la tienda.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  private queueSharedStoreSave(data: StoreData): void {
    this.pendingSyncs += 1;
    this.syncQueue = this.syncQueue.then(async () => {
      if (!this.storeConnected) throw new Error('No hay conexión con la tienda principal.');
      const expectedRevision = this.serverRevision;
      const response = await fetch(`${this.mobileServerUrl}/api/store`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.mobileSyncToken}`,
          'Content-Type': 'application/json',
          'If-Match': String(expectedRevision),
        },
        body: JSON.stringify(data),
      });
      if (response.status === 409) {
        this.storeConnected = false;
        throw new Error('Otro dispositivo guardó cambios al mismo tiempo. Reconecta para cargar la versión actual antes de continuar.');
      }
      if (!response.ok) throw new Error(await this.readServerError(response));
      const result = await response.json() as { revision: number };
      this.serverRevision = result.revision;
      this.storeConnected = true;
      localStorage.removeItem('tienda-sync-pending');
      this.connectionStatus = 'Cambios sincronizados con la tienda principal.';
      this.message = this.connectionStatus;
    }).catch((error: unknown) => {
      this.storeConnected = false;
      localStorage.setItem('tienda-sync-pending', JSON.stringify({ data, revision: this.serverRevision }));
      this.connectionStatus = error instanceof Error ? error.message : 'No se pudieron sincronizar los cambios.';
      this.message = `Cambios guardados solo en este dispositivo: ${this.connectionStatus}`;
    }).finally(() => {
      this.pendingSyncs -= 1;
      this.changeDetector.markForCheck();
    });
  }

  private readPendingStoreSave(): PendingStoreSave | null {
    const saved = localStorage.getItem('tienda-sync-pending');
    if (!saved) return null;
    const pending = JSON.parse(saved) as PendingStoreSave;
    if (!pending || !Number.isInteger(pending.revision) || !this.isValidStoreData(pending.data)) {
      throw new Error('Hay una copia local pendiente con formato no válido. No se modificó ningún dato.');
    }
    return pending;
  }

  protected completeCashClosing(): void {
    const shift = this.cashClosingShift;
    if (!shift || shift.id !== this.activeShiftId || !this.currentUser || this.currentUser.role !== 'Empleado') return;
    const invalidCount = this.cashDenominations.some(({ value }) => {
      const count = Number(this.cashCounts[String(value)] ?? 0);
      return !Number.isInteger(count) || count < 0;
    });
    const cardReceipts = Number(this.cardReceiptTotal);
    if (invalidCount || !Number.isFinite(cardReceipts) || cardReceipts < 0) {
      this.message = 'Revisa que las cantidades de billetes, monedas y comprobantes sean números válidos.';
      return;
    }
    const sales = this.salesForShift(shift);
    const expectedTotal = this.roundCurrency(sales.reduce((sum, sale) => sum + sale.total, 0));
    const cashCounted = this.cashCountTotal;
    const countedTotal = this.roundCurrency(cashCounted + cardReceipts);
    const updatedShift: EmployeeShift = {
      ...shift,
      employeeName: this.currentUser.name,
      status: 'closed',
      endedAt: new Date().toISOString(),
      expectedTotal,
      cashCounted,
      cardReceipts,
      countedTotal,
      difference: this.roundCurrency(countedTotal - expectedTotal - (shift.openingCash ?? 0)),
      denominations: { ...this.cashCounts },
      salesCount: sales.length,
      adminViewed: false,
    };
    const previousShifts = this.shifts;
    this.shifts = this.shifts.map((record) => record.id === shift.id ? updatedShift : record);
    if (!this.persistData()) {
      this.shifts = previousShifts;
      return;
    }
    this.cashClosingShiftId = null;
    this.showCashClosing = false;
    this.cashCounts = {};
    this.cardReceiptTotal = 0;
    this.finishLogout();
  }

  private finishLogout(): void {
    this.currentUser = null;
    this.activeShiftId = null;
    this.showShiftOpening = false;
    this.shiftOpeningAmount = 0;
    this.cart = [];
    this.amountReceived = 0;
    this.barcodeInput = '';
    this.rechargeAmount = 0;
    this.editingProductId = null;
    this.editingEmployeeId = null;
    this.productDeletionRequestId = null;
    this.loginUsername = '';
    this.loginPassword = '';
    this.activeSection = 'inicio';
  }

  protected openNewProduct(): void {
    if (!this.currentUser) return;
    this.editingProductId = null;
    this.productDraft = this.emptyProduct();
    this.showProductForm = true;
  }

  protected editProduct(product: Product): void {
    if (!this.isAdmin) return;
    this.editingProductId = product.id;
    this.productDraft = { ...product };
    this.showProductForm = true;
  }

  protected saveProduct(): void {
    if (!this.currentUser || (this.editingProductId && !this.isAdmin)) return;
    const name = this.productDraft.name.trim();
    const barcode = this.productDraft.barcode?.trim() ?? '';
    if (!name || !this.productDraft.category || this.productDraft.price <= 0 || this.productDraft.stock < 0) {
      this.message = 'Revisa el nombre, la categoría, el precio y la existencia del producto.';
      return;
    }
    if (barcode && this.products.some((product) =>
      product.barcode?.trim() === barcode && product.id !== this.editingProductId,
    )) {
      this.message = 'Ese código de barras ya está asignado a otro producto.';
      return;
    }
    if (this.editingProductId) {
      this.products = this.products.map((product) =>
        product.id === this.editingProductId ? { ...this.productDraft, name, barcode } : product,
      );
    } else {
      this.products = [{ ...this.productDraft, id: this.createId(), name, barcode }, ...this.products];
    }
    this.showProductForm = false;
    this.persistData();
  }

  protected exportProductsToCsv(): void {
    if (!this.isAdmin) return;
    const cell = (value: string | number): string => {
      let text = String(value);
      if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const rows: (string | number)[][] = [
      ['Nombre', 'Categoria', 'Precio', 'Existencias', 'Codigo de barras', 'Emoji', 'Descripcion'],
      ...this.products.map((product) => [
        product.name,
        product.category,
        product.price,
        product.stock,
        product.barcode ?? '',
        product.emoji,
        product.description,
      ]),
    ];
    if (this.downloadCsv(`productos-${this.localDateKey(new Date())}.csv`, rows, cell)) {
      this.message = 'Catálogo exportado a CSV compatible con Excel.';
    }
  }

  protected async importProducts(event: Event): Promise<void> {
    if (!this.isAdmin) return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      this.message = 'No se pudo leer el archivo seleccionado.';
      return;
    }
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (!file.name.toLocaleLowerCase().endsWith('.csv')) {
        throw new Error('Selecciona un archivo CSV.');
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('El archivo no puede superar 5 MB.');
      }
      const importedProducts = this.readProductsCsv(await file.text());
      const nextProducts = [...this.products];
      const usedTargets = new Set<string>();
      const newCategories = [...this.categories];
      let added = 0;
      let updated = 0;

      for (const imported of importedProducts) {
        const normalizedName = this.normalizeProductName(imported.name);
        const barcodeMatch = imported.barcode
          ? nextProducts.find((product) => product.barcode?.trim() === imported.barcode)
          : undefined;
        const nameMatch = nextProducts.find((product) =>
          this.normalizeProductName(product.name) === normalizedName,
        );
        const target = barcodeMatch ?? (!imported.barcode ? nameMatch : undefined);
        if (barcodeMatch && nameMatch && barcodeMatch.id !== nameMatch.id) {
          throw new Error(`El código de barras y el nombre de "${imported.name}" apuntan a productos distintos.`);
        }
        if (imported.barcode) {
          const barcodeConflict = nextProducts.find((product) =>
            product.barcode?.trim() === imported.barcode && product.id !== target?.id,
          );
          if (barcodeConflict) {
            throw new Error(`El código de barras ${imported.barcode} ya pertenece a otro producto.`);
          }
        }
        if (target && usedTargets.has(target.id)) {
          throw new Error(`El archivo contiene más de una fila para "${imported.name}".`);
        }
        const product: Product = {
          name: imported.name,
          category: imported.category,
          price: imported.price,
          stock: imported.stock,
          barcode: imported.hasBarcodeColumn ? imported.barcode : target?.barcode ?? '',
          emoji: imported.hasEmojiColumn ? imported.emoji : target?.emoji ?? '🛍️',
          description: imported.hasDescriptionColumn ? imported.description : target?.description ?? '',
          id: target?.id ?? this.createId(),
        };
        if (target) {
          usedTargets.add(target.id);
          const index = nextProducts.findIndex((item) => item.id === target.id);
          nextProducts[index] = product;
          updated += 1;
        } else {
          nextProducts.unshift(product);
          added += 1;
        }
        if (!newCategories.some((category) =>
          this.normalizeProductName(category) === this.normalizeProductName(imported.category),
        )) {
          newCategories.push(imported.category);
        }
      }

      const previousProducts = this.products;
      const previousCategories = this.categories;
      this.products = nextProducts;
      this.categories = newCategories;
      if (!this.persistData()) {
        this.products = previousProducts;
        this.categories = previousCategories;
        return;
      }
      this.message = `Importación completada: ${added} productos agregados y ${updated} actualizados.`;
    } catch (error) {
      this.message = `No se importó el archivo: ${error instanceof Error ? error.message : 'error desconocido'}`;
    } finally {
      input.value = '';
    }
  }

  private readProductsCsv(contents: string): ImportedProduct[] {
    const rows = this.parseCsv(contents);
    if (rows.length < 2) throw new Error('El archivo debe tener encabezados y al menos un producto.');
    const headerAliases: Record<string, string[]> = {
      name: ['nombre', 'name'],
      category: ['categoria', 'category'],
      price: ['precio', 'price'],
      stock: ['existencias', 'stock', 'existencia'],
      barcode: ['codigodebarras', 'barcode', 'codigo'],
      emoji: ['emoji'],
      description: ['descripcion', 'description'],
    };
    const headers = rows[0].map((header) => this.normalizeHeader(header));
    const columns = Object.fromEntries(Object.entries(headerAliases).map(([field, aliases]) => [
      field,
      headers.findIndex((header) => aliases.includes(header)),
    ])) as Record<keyof ImportedProduct, number>;
    for (const requiredField of ['name', 'category', 'price', 'stock'] as const) {
      if (columns[requiredField] < 0) throw new Error(`Falta la columna obligatoria "${requiredField}".`);
    }

    const products = rows.slice(1).map((row, index): ImportedProduct => {
      const line = index + 2;
      const get = (field: keyof ImportedProduct): string =>
        columns[field] >= 0 ? (row[columns[field]] ?? '').trim() : '';
      const name = get('name');
      const category = get('category');
      const priceText = get('price').replace(/\s/g, '').replace(',', '.');
      const price = Number(priceText);
      const stock = Number(get('stock'));
      if (!name || !category || !priceText || !get('stock')
        || !Number.isFinite(price) || price <= 0
        || !Number.isInteger(stock) || stock < 0) {
        throw new Error(`Revisa nombre, categoría, precio y existencias en la fila ${line}.`);
      }
      return {
        name,
        category,
        price: this.roundCurrency(price),
        stock,
        barcode: get('barcode'),
        emoji: get('emoji') || '🛍️',
        description: get('description'),
        hasBarcodeColumn: columns.barcode >= 0,
        hasEmojiColumn: columns.emoji >= 0,
        hasDescriptionColumn: columns.description >= 0,
      };
    }).filter((product) => product.name || product.category);

    if (!products.length) throw new Error('El archivo no contiene productos válidos.');
    const barcodeRows = new Set<string>();
    const identifierRows = new Set<string>();
    for (const product of products) {
      const barcode = product.barcode.trim();
      const identifier = barcode ? `barcode:${barcode}` : `name:${this.normalizeProductName(product.name)}`;
      if (barcode && barcodeRows.has(barcode) || identifierRows.has(identifier)) {
        throw new Error(`El archivo repite el código de barras o producto "${product.name}".`);
      }
      if (barcode) barcodeRows.add(barcode);
      identifierRows.add(identifier);
    }
    return products;
  }

  private parseCsv(contents: string): string[][] {
    const text = contents.replace(/^\uFEFF/, '');
    const delimiter = this.detectCsvDelimiter(text);
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    let quoteClosed = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
          quoteClosed = true;
        } else {
          cell += character;
        }
        continue;
      }
      if (character === '"' && cell.length === 0 && !quoteClosed) {
        quoted = true;
      } else if (character === delimiter) {
        row.push(cell);
        cell = '';
        quoteClosed = false;
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        row.push(cell);
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
        cell = '';
        quoteClosed = false;
      } else {
        if (quoteClosed) throw new Error('El CSV tiene caracteres inválidos después de una celda entre comillas.');
        cell += character;
      }
    }
    if (quoted) throw new Error('El CSV contiene comillas sin cerrar.');
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
    return rows;
  }

  private detectCsvDelimiter(contents: string): string {
    let firstLine = '';
    let quoted = false;
    for (let index = 0; index < contents.length; index += 1) {
      const character = contents[index];
      if (character === '"' && contents[index + 1] === '"' && quoted) {
        firstLine += '""';
        index += 1;
      } else if (character === '"') {
        quoted = !quoted;
        firstLine += character;
      } else if (!quoted && (character === '\n' || character === '\r')) {
        break;
      } else {
        firstLine += character;
      }
    }
    const delimiters = [',', ';', '\t'];
    const counts = delimiters.map((delimiter) => {
      let count = 0;
      let inQuotes = false;
      for (let index = 0; index < firstLine.length; index += 1) {
        if (firstLine[index] === '"' && firstLine[index + 1] === '"' && inQuotes) index += 1;
        else if (firstLine[index] === '"') inQuotes = !inQuotes;
        else if (!inQuotes && firstLine[index] === delimiter) count += 1;
      }
      return count;
    });
    const selected = counts.indexOf(Math.max(...counts));
    if (counts[selected] === 0) throw new Error('No se detectaron columnas separadas por coma o punto y coma.');
    return delimiters[selected];
  }

  private normalizeHeader(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private normalizeProductName(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  }

  private downloadCsv(
    filename: string,
    rows: (string | number)[][],
    cell: (value: string | number) => string,
  ): boolean {
    if (typeof URL.createObjectURL !== 'function') {
      this.message = 'No se pudo preparar el archivo CSV en este entorno.';
      return false;
    }
    const csv = `\uFEFF${rows.map((row) => row.map(cell).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  protected deleteProduct(product: Product): void {
    if (!this.isAdmin) return;
    if (!window.confirm(`¿Eliminar "${product.name}" del catálogo?`)) return;
    this.products = this.products.filter((item) => item.id !== product.id);
    this.cart = this.cart.filter((item) => item.productId !== product.id);
    this.deletionRequests = this.deletionRequests.filter((request) => request.productId !== product.id);
    this.persistData();
  }

  protected requestProductDeletion(product: Product): void {
    if (!this.currentUser || this.isAdmin) return;
    if (this.deletionRequests.some((request) => request.productId === product.id)) {
      this.message = 'Ya enviaste una solicitud para este producto.';
      return;
    }
    this.productDeletionRequestId = product.id;
    this.deletionRequestMessage = '';
  }

  protected sendProductDeletionRequest(product: Product): void {
    if (!this.currentUser || this.isAdmin || this.productDeletionRequestId !== product.id) return;
    const request: ProductDeletionRequest = {
      id: this.createId(),
      productId: product.id,
      productName: product.name,
      employeeId: this.currentUser.id,
      employeeName: this.currentUser.name,
      message: this.deletionRequestMessage.trim(),
      date: new Date().toISOString(),
    };
    if (this.deletionRequests.some((item) => item.productId === product.id)) return;
    this.deletionRequests = [...this.deletionRequests, request];
    this.productDeletionRequestId = null;
    this.deletionRequestMessage = '';
    this.persistData();
  }

  protected resolveProductDeletionRequest(request: ProductDeletionRequest, approve: boolean): void {
    if (!this.isAdmin) return;
    if (approve) {
      const product = this.products.find((item) => item.id === request.productId);
      if (product && !window.confirm(`¿Eliminar "${product.name}" del catálogo?`)) return;
      this.products = this.products.filter((item) => item.id !== request.productId);
      this.cart = this.cart.filter((item) => item.productId !== request.productId);
    }
    this.deletionRequests = this.deletionRequests.filter((item) => item.id !== request.id);
    this.persistData();
  }

  protected addToCart(product: Product): void {
    if (!this.currentUser || this.isAdmin) return;
    const cartItem = this.cart.find((item) => item.productId === product.id);
    if (product.stock < (cartItem?.quantity ?? 0) + 1) {
      this.message = `No hay suficientes existencias de ${product.name}.`;
      return;
    }
    this.cart = cartItem
      ? this.cart.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...this.cart, { productId: product.id, name: product.name, price: product.price, quantity: 1 }];
    this.message = '';
  }

  protected addRechargeToCart(): void {
    if (!this.currentUser || this.isAdmin) return;
    const amount = Number(this.rechargeAmount);
    const provider = this.rechargeProviders.find((item) => item.name === this.rechargeProvider);
    if (!provider || !Number.isFinite(amount) || amount <= 0) {
      this.message = 'Selecciona una compañía e ingresa un importe de recarga válido.';
      return;
    }
    this.cart = [...this.cart, {
      productId: `recharge-${this.createId()}`,
      name: `Recarga ${provider.name}`,
      price: amount,
      quantity: 1,
      kind: 'recharge',
      provider: provider.name,
    }];
    this.rechargeAmount = 0;
    this.message = '';
  }

  protected scanBarcode(): void {
    if (!this.currentUser || this.isAdmin) return;
    const barcode = this.barcodeInput.trim();
    if (!barcode) return;
    const product = this.products.find((candidate) => candidate.barcode?.trim() === barcode);
    this.barcodeInput = '';
    if (!product) {
      this.message = `No hay un producto registrado con el código ${barcode}.`;
      return;
    }
    this.addToCart(product);
  }

  protected changeCartQuantity(item: CartItem, change: number): void {
    const nextQuantity = item.quantity + change;
    const product = this.products.find((candidate) => candidate.id === item.productId);
    if (nextQuantity > (product?.stock ?? 0)) {
      this.message = `Existencia disponible: ${product?.stock ?? 0}.`;
      return;
    }
    this.cart = nextQuantity <= 0
      ? this.cart.filter((candidate) => candidate.productId !== item.productId)
      : this.cart.map((candidate) => candidate.productId === item.productId ? { ...candidate, quantity: nextQuantity } : candidate);
    this.message = '';
  }

  protected completeSale(): void {
    if (!this.currentUser || this.isAdmin || !this.cart.length) return;
    if (!this.currentShift) {
      this.message = 'No hay un turno abierto. Cierra sesión e inicia nuevamente antes de registrar ventas.';
      return;
    }
    if (this.cashPaymentShortfall) {
      this.message = 'El efectivo recibido no alcanza para cubrir el total.';
      return;
    }
    if (this.paymentMethod === 'Efectivo'
      && (!Number.isFinite(this.amountReceived) || this.amountReceived < 0)) {
      this.message = 'Ingresa un monto válido para el efectivo recibido.';
      return;
    }
    for (const item of this.cart) {
      if (item.kind === 'recharge') continue;
      const product = this.products.find((candidate) => candidate.id === item.productId);
      if (!product || product.stock < item.quantity) {
        this.message = `No se pudo completar la venta: revisa la existencia de ${item.name}.`;
        return;
      }
    }
    const sale: Sale = {
      id: this.createId(),
      employeeId: this.currentUser.id,
      employeeName: this.currentUser.name,
      shiftId: this.currentShift.id,
      date: new Date().toISOString(),
      total: this.cartTotal,
      items: this.cart.map((item) => ({ ...item })),
      paymentMethod: this.paymentMethod,
      amountReceived: this.paymentMethod === 'Efectivo' ? this.amountReceived : this.cartTotal,
      changeGiven: this.paymentMethod === 'Efectivo' ? this.changeDue : 0,
    };
    this.products = this.products.map((product) => {
      const soldItem = this.cart.find((item) => item.productId === product.id);
      return soldItem && soldItem.kind !== 'recharge'
        ? { ...product, stock: product.stock - soldItem.quantity }
        : product;
    });
    this.sales = [sale, ...this.sales];
    this.cart = [];
    this.amountReceived = 0;
    this.paymentMethod = 'Efectivo';
    this.activeSection = this.isAdmin ? 'reportes' : 'ventas';
    this.message = 'Venta registrada correctamente.';
    this.persistData();
  }

  protected addCategory(): void {
    const category = this.newCategory.trim();
    if (!category) return;
    if (this.categories.some((item) => item.toLocaleLowerCase() === category.toLocaleLowerCase())) {
      this.message = 'Esa categoría ya existe.';
      return;
    }
    this.categories = [...this.categories, category];
    this.newCategory = '';
    this.persistData();
  }

  protected deleteCategory(category: string): void {
    if (this.products.some((product) => product.category === category)) {
      this.message = 'No puedes eliminar una categoría que todavía tiene productos.';
      return;
    }
    this.categories = this.categories.filter((item) => item !== category);
    if (this.selectedCategory === category) this.selectedCategory = 'Todas';
    this.persistData();
  }

  protected editEmployee(employee: Employee): void {
    if (!this.isAdmin) return;
    this.editingEmployeeId = employee.id;
    this.employeeDraft = {
      name: employee.name,
      username: employee.username,
      password: employee.password,
      role: employee.role,
      scheduleStart: employee.scheduleStart ?? '',
      scheduleEnd: employee.scheduleEnd ?? '',
    };
  }

  protected saveEmployee(): void {
    if (!this.isAdmin) return;
    const name = this.employeeDraft.name.trim();
    const username = this.employeeDraft.username.trim();
    const password = this.employeeDraft.password;
    if (!name || !username || !password) {
      this.message = 'Completa el nombre, usuario y contraseña.';
      return;
    }
    if (this.employeeDraft.role === 'Empleado'
      && (!this.employeeDraft.scheduleStart || !this.employeeDraft.scheduleEnd
        || this.employeeDraft.scheduleEnd === this.employeeDraft.scheduleStart)) {
      this.message = 'Define las horas de entrada y salida del turno.';
      return;
    }
    if (this.employees.some((employee) =>
      employee.username.toLocaleLowerCase() === username.toLocaleLowerCase()
      && employee.id !== this.editingEmployeeId,
    )) {
      this.message = 'Ese nombre de usuario ya está registrado.';
      return;
    }
    const currentAdmin = this.currentUser?.id === this.editingEmployeeId;
    if (currentAdmin && this.employeeDraft.role !== 'Administrador') {
      this.message = 'No puedes cambiar tu propio perfil de administrador a empleado.';
      return;
    }
    if (this.editingEmployeeId
      && this.employees.find((employee) => employee.id === this.editingEmployeeId)?.role === 'Administrador'
      && this.employeeDraft.role !== 'Administrador'
      && this.employees.filter((employee) => employee.role === 'Administrador').length === 1) {
      this.message = 'Debe permanecer al menos un perfil de administrador.';
      return;
    }
    const updatedEmployee: Employee = {
      ...this.employeeDraft,
      id: this.editingEmployeeId ?? this.createId(),
      name,
      username,
      scheduleStart: this.employeeDraft.role === 'Empleado' ? this.employeeDraft.scheduleStart : undefined,
      scheduleEnd: this.employeeDraft.role === 'Empleado' ? this.employeeDraft.scheduleEnd : undefined,
    };
    const previousEmployee = this.employees.find((employee) => employee.id === this.editingEmployeeId);
    if (previousEmployee?.role === 'Empleado' && updatedEmployee.role === 'Administrador'
      && this.shifts.some((shift) => shift.employeeId === previousEmployee.id && shift.status === 'open')) {
      this.message = 'El empleado debe completar su corte final antes de cambiar su perfil a administrador.';
      return;
    }
    this.employees = this.editingEmployeeId
      ? this.employees.map((employee) => employee.id === this.editingEmployeeId ? updatedEmployee : employee)
      : [...this.employees, updatedEmployee];
    if (currentAdmin) this.currentUser = updatedEmployee;
    this.employeeDraft = this.emptyEmployee();
    this.editingEmployeeId = null;
    this.persistData();
  }

  protected cancelEmployeeEdit(): void {
    this.employeeDraft = this.emptyEmployee();
    this.editingEmployeeId = null;
    this.message = '';
  }

  protected deleteEmployee(employee: Employee): void {
    if (!this.isAdmin) return;
    if (employee.id === this.currentUser?.id) {
      this.message = 'No puedes eliminar el perfil con el que iniciaste sesión.';
      return;
    }
    if (this.sales.some((sale) => sale.employeeId === employee.id)) {
      this.message = 'No puedes eliminar un perfil con ventas registradas; conserva su historial.';
      return;
    }
    if (this.shifts.some((shift) => shift.employeeId === employee.id && shift.status === 'open')) {
      this.message = 'El empleado debe completar su corte final antes de eliminar su perfil.';
      return;
    }
    if (!window.confirm(`¿Eliminar el perfil de ${employee.name}?`)) return;
    this.employees = this.employees.filter((item) => item.id !== employee.id);
    this.persistData();
  }

  protected salesForEmployee(employeeId: string): Sale[] {
    return this.sales.filter((sale) => sale.employeeId === employeeId);
  }

  protected deleteSale(sale: Sale): void {
    if (!this.isAdmin) return;
    if (!window.confirm(`¿Eliminar la venta #${sale.id.slice(-5).toUpperCase()} de ${sale.employeeName}? El inventario se restaurará.`)) return;
    this.products = this.products.map((product) => {
      const soldQuantity = sale.items
        .filter((item) => item.kind !== 'recharge' && item.productId === product.id)
        .reduce((sum, item) => sum + item.quantity, 0);
      return soldQuantity ? { ...product, stock: product.stock + soldQuantity } : product;
    });
    this.sales = this.sales.filter((record) => record.id !== sale.id);
    this.persistData();
  }

  protected salesCsvContent(): string {
    const cell = (value: string | number): string => {
      let text = String(value);
      if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const rows = [
      ['Folio', 'Fecha y hora', 'Empleado', 'Productos', 'Forma de pago', 'Total', 'Efectivo recibido', 'Cambio'],
      ...this.visibleSales.map((sale) => [
        sale.id,
        new Date(sale.date).toLocaleString('es-MX'),
        sale.employeeName,
        sale.items.map((item) => `${item.name} x${item.quantity}`).join(' | '),
        sale.paymentMethod ?? '',
        sale.total.toFixed(2),
        (sale.amountReceived ?? 0).toFixed(2),
        (sale.changeGiven ?? 0).toFixed(2),
      ]),
    ];
    return `\uFEFF${rows.map((row) => row.map(cell).join(';')).join('\r\n')}`;
  }

  protected exportSalesToExcel(): void {
    if (!this.isAdmin) return;
    if (typeof URL.createObjectURL !== 'function') {
      this.message = 'No se pudo preparar el archivo de ventas en este entorno.';
      return;
    }
    const blob = new Blob([this.salesCsvContent()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ventas-${this.localDateKey(new Date())}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.message = 'Archivo compatible con Excel descargado.';
  }

  protected salesForShift(shift: EmployeeShift | undefined): Sale[] {
    if (!shift) return [];
    const start = new Date(shift.startedAt).getTime();
    const end = shift.endedAt ? new Date(shift.endedAt).getTime() : Date.now();
    return this.sales.filter((sale) => sale.employeeId === shift.employeeId
      && (sale.shiftId === shift.id
        || !sale.shiftId && new Date(sale.date).getTime() >= start && new Date(sale.date).getTime() <= end));
  }

  protected productCountForCategory(category: string): number {
    return this.products.filter((product) => product.category === category).length;
  }

  protected salePieces(sale: Sale): number {
    return sale.items.reduce((total, item) => total + item.quantity, 0);
  }

  protected setCategoryFilter(category: string): void {
    this.selectedCategory = category;
    this.activeSection = 'productos';
  }

  protected saveCameraSettings(): void {
    if (!this.isAdmin) return;
    const name = this.cameraDraft.name.trim();
    const address = this.normalizeCameraAddress(this.cameraDraft.address);
    if (!name || !address) {
      this.message = 'Ingresa un nombre y una dirección HTTP o HTTPS de la cámara.';
      return;
    }
    let parsedAddress: URL;
    try {
      parsedAddress = new URL(address);
    } catch (error) {
      this.message = `La dirección de la cámara no es válida: ${error instanceof Error ? error.message : 'revisa el formato.'}`;
      return;
    }
    if (!['http:', 'https:'].includes(parsedAddress.protocol)
      || parsedAddress.username || parsedAddress.password
      || parsedAddress.search || parsedAddress.hash
      || !this.isLocalCameraHost(parsedAddress.hostname)) {
      this.message = 'Usa una dirección HTTP/HTTPS de la red local o de Tailscale, sin credenciales, parámetros ni anclas.';
      return;
    }
    this.cameraSettings = { name, address: parsedAddress.href };
    this.cameraDraft = { ...this.cameraSettings };
    this.persistData();
  }

  private normalizeCameraAddress(address: string): string {
    const trimmed = address.trim();
    if (!trimmed) return '';
    return /^[\w.-]+(?::\d+)?(?:\/.*)?$/.test(trimmed) && !trimmed.includes('://')
      ? `http://${trimmed}`
      : trimmed;
  }

  private isLocalCameraHost(hostname: string): boolean {
    const host = hostname.toLocaleLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal')) {
      return true;
    }
    const octets = host.split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
    }
    return octets[0] === 10
      || octets[0] === 192 && octets[1] === 168
      || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31
      || octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127
      || octets[0] === 127;
  }

  private emptyProduct(): Product {
    return { id: '', name: '', category: this.categories[0] ?? '', price: 0, stock: 0, emoji: '🛍️', description: '', barcode: '' };
  }

  private emptyEmployee(): Omit<Employee, 'id'> {
    return { name: '', username: '', password: '', role: 'Empleado', scheduleStart: '', scheduleEnd: '' };
  }

  private createId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private roundCurrency(amount: number): number {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  }

  private localDateKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  private loadData(): void {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (!saved) return;
      const data: StoreData = JSON.parse(saved) as StoreData;
      this.applyStoreData(data);
    } catch (error) {
      this.message = `No se pudieron cargar los datos guardados: ${error instanceof Error ? error.message : 'error desconocido'}`;
    }
  }

  private isValidStoreData(data: StoreData): boolean {
    return Array.isArray(data.products) && Array.isArray(data.categories)
      && Array.isArray(data.employees) && Array.isArray(data.sales)
      && (data.deletionRequests === undefined || Array.isArray(data.deletionRequests))
      && (data.shifts === undefined || Array.isArray(data.shifts))
      && (data.cameraSettings === undefined
        || Boolean(data.cameraSettings && typeof data.cameraSettings.address === 'string'
          && typeof data.cameraSettings.name === 'string'));
  }

  private applyStoreData(data: StoreData): void {
    if (!this.isValidStoreData(data)) {
      throw new Error('Los datos de la tienda no tienen el formato esperado.');
    }
    const activeUserId = this.currentUser?.id;
    this.products = data.products.map((product) => ({ ...product, barcode: product.barcode ?? '' }));
    this.categories = data.categories;
    this.employees = data.employees.filter((employee) =>
      !(
        employee.username === 'admin' && employee.password === 'admin123'
        || employee.username === 'ana' && employee.password === 'empleado123'
        || employee.username === 'luis' && employee.password === 'empleado123'
      ),
    );
    this.needsAdminSetup = !this.employees.some((employee) => employee.role === 'Administrador');
    this.sales = data.sales;
    this.shifts = data.shifts ?? [];
    this.deletionRequests = data.deletionRequests ?? [];
    this.cameraSettings = data.cameraSettings ?? this.cameraSettings;
    this.cameraDraft = { ...this.cameraSettings };
    if (activeUserId) {
      this.currentUser = this.employees.find((employee) => employee.id === activeUserId) ?? null;
      if (!this.currentUser) this.finishLogout();
    }
  }

  private createStoreData(): StoreData {
    return {
      products: this.products,
      categories: this.categories,
      employees: this.employees,
      sales: this.sales,
      deletionRequests: this.deletionRequests,
      cameraSettings: this.cameraSettings,
      shifts: this.shifts,
    };
  }

  private persistData(): boolean {
    try {
      const data = this.createStoreData();
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      const canRetryRemoteSync = (this.isMobileApp || this.isRemoteDesktopClient)
        && Boolean(this.mobileServerUrl && this.mobileSyncToken);
      if (this.storeConnected || canRetryRemoteSync) {
        this.queueSharedStoreSave(data);
        this.message = this.storeConnected
          ? 'Guardando cambios compartidos...'
          : 'Cambios guardados en este dispositivo; se enviarán al reconectar.';
      } else {
        this.message = 'Cambios guardados en este equipo.';
      }
      return true;
    } catch (error) {
      this.message = `No se pudieron guardar los cambios: ${error instanceof Error ? error.message : 'error desconocido'}`;
      return false;
    }
  }
}
