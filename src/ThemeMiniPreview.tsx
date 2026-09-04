
import type {ExamTheme} from "./examTheme";

// Pure CSS-only miniature representations for the theme picker cards - no images, no canvas, no
// external libraries, just a handful of divs styled per theme in builder-pro.css.
export default function ThemeMiniPreview({theme}:{theme:ExamTheme}){
 switch(theme){
  case "cards":
   return <div className="theme-mini-preview theme-mini-cards"><span className="tm-card"/><span className="tm-card"/><span className="tm-card"/></div>;
  case "classic":
   return <div className="theme-mini-preview theme-mini-classic"><span className="tm-bar"/><span className="tm-bar"/><span className="tm-bar"/></div>;
  case "focus":
   return <div className="theme-mini-preview theme-mini-focus"><span className="tm-single"/><span className="tm-dots"><span className="active"/><span/><span/></span></div>;
  case "compact":
   return <div className="theme-mini-preview theme-mini-compact"><span className="tm-line"/><span className="tm-line"/><span className="tm-line"/><span className="tm-line"/></div>;
  case "modern":
   return <div className="theme-mini-preview theme-mini-modern"><span className="tm-bar"/><span className="tm-card"/></div>;
  default:
   return <div className="theme-mini-preview theme-mini-default"><span className="tm-bar"/><span className="tm-bar"/></div>;
 }
}
