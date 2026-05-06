import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-destructive/10 via-background to-background">
      <div className="text-center space-y-6 px-4">
        <div className="flex justify-center">
          <AlertTriangle className="w-16 h-16 text-destructive animate-pulse" />
        </div>
        <div>
          <h1 className="mb-2 text-6xl font-stencil font-bold text-destructive glow-text">404</h1>
          <p className="text-xl text-muted-foreground mb-2">Маршрут не найден</p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">Похоже, вы попали в зону, которой нет на карте. Вернитесь в безопасность.</p>
        </div>
        <div className="flex gap-3 justify-center flex-wrap">
          <Button className="bg-primary text-black font-bold stencil" onClick={() => navigate("/")}>
            НА ГЛАВНУЮ
          </Button>
          <Button variant="outline" className="stencil" onClick={() => navigate(-1)}>
            НАЗАД
          </Button>
        </div>
        <p className="text-xs text-muted-foreground opacity-60">
          Адрес: {location.pathname}
        </p>
      </div>
    </div>
  );
};

export default NotFound;
