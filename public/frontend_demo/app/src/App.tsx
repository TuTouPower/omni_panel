import { Routes, Route } from 'react-router';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import Workspace from '@/pages/Workspace';
import Library from '@/pages/Library';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* Layout 使用 <Outlet/>，因此采用嵌套路由模式 */}
      <Route element={<Layout />}>
        <Route path="/workspace" element={<Workspace />} />
        <Route path="/library" element={<Library />} />
      </Route>
    </Routes>
  );
}
