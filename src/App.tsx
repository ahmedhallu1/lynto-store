import { lazy, Suspense } from 'react';
import { I18nProvider, langFromPath, stripLang } from './i18n';
import { match, useLocation } from './lib/router';
import { StoreProvider } from './lib/store';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { Home } from './pages/Home';
import { Catalog } from './pages/Catalog';
import { ProductPage } from './pages/Product';
import { Cart } from './pages/Cart';
import { Checkout } from './pages/Checkout';
import { OrderPage } from './pages/Order';
import { About, Guarantee, NotFound, Privacy, Support, Terms } from './pages/Info';

const AdminApp = lazy(() => import('./admin/AdminApp'));

function StoreRoutes({ path }: { path: string }) {
  let m: Record<string, string> | null;
  if (path === '/') return <Home />;
  if (path === '/products') return <Catalog />;
  if ((m = match('/c/:slug', path))) return <Catalog key={m.slug} categorySlug={m.slug} />;
  if ((m = match('/p/:slug', path))) return <ProductPage key={m.slug} slug={m.slug} />;
  if (path === '/cart') return <Cart />;
  if (path === '/checkout') return <Checkout />;
  if ((m = match('/order/:number', path))) return <OrderPage key={m.number} number={m.number} />;
  if (path === '/support') return <Support />;
  if (path === '/about') return <About />;
  if (path === '/privacy') return <Privacy />;
  if (path === '/terms') return <Terms />;
  if (path === '/guarantee') return <Guarantee />;
  return <NotFound />;
}

export function App() {
  const { pathname } = useLocation();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return (
      <Suspense fallback={<Spinner />}>
        <AdminApp />
      </Suspense>
    );
  }
  const lang = langFromPath(pathname);
  const path = stripLang(pathname).replace(/\/+$/, '') || '/';
  return (
    <I18nProvider lang={lang}>
      <StoreProvider>
        <Layout>
          <StoreRoutes path={path} />
        </Layout>
      </StoreProvider>
    </I18nProvider>
  );
}
