import { Outlet } from "react-router-dom";

export default function AppLayout() {
    return (
        <div>
            <aside>Sidebar</aside>
            <main>
                <Outlet />
            </main>
        </div>
    );
}