import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// This page has been replaced by area selection on the landing page.
// Redirect visitors to the landing page quiz section.
export default function ModuleSelection() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  return null;
}
