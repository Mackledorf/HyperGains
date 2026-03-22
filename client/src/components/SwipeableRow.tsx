import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  confirmTitle?: string;
  confirmDescription?: string;
}

const SWIPE_THRESHOLD = 72;

export default function SwipeableRow({
  children,
  onDelete,
  deleteLabel = "Delete",
  confirmTitle = "Delete item?",
  confirmDescription = "This action cannot be undone.",
}: SwipeableRowProps) {
  const [translateX, setTranslateX] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const startXRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    isDraggingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startXRef.current === null) return;
    const delta = e.touches[0].clientX - startXRef.current;
    if (delta > 0) {
      setTranslateX(0);
      return;
    }
    isDraggingRef.current = true;
    setTranslateX(Math.max(delta, -SWIPE_THRESHOLD - 16));
  };

  const handleTouchEnd = () => {
    if (-translateX >= SWIPE_THRESHOLD) {
      setTranslateX(-SWIPE_THRESHOLD);
    } else {
      setTranslateX(0);
    }
    isDraggingRef.current = false;
    startXRef.current = null;
  };

  const handleDeleteConfirm = () => {
    setTranslateX(0);
    onDelete();
  };

  const handleCancel = () => {
    setTranslateX(0);
    setIsOpen(false);
  };

  return (
    <>
      {/* group enables hover-based delete affordance for pointer devices */}
      <div className="group relative overflow-hidden">
        {/* Delete zone — sits behind content, revealed by left-swipe on touch */}
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-destructive"
          style={{ width: SWIPE_THRESHOLD }}
        >
          <button
            className="flex flex-col items-center gap-0.5 px-4 text-destructive-foreground"
            onClick={() => setIsOpen(true)}
            aria-label={deleteLabel}
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">{deleteLabel}</span>
          </button>
        </div>

        {/* Swipeable content — bg-card keeps the delete zone hidden at rest */}
        <div
          className="relative bg-card"
          style={{
            transform: `translateX(${translateX}px)`,
            transition: isDraggingRef.current ? "none" : "transform 0.2s ease",
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {children}

          {/* Desktop delete button — fades in on pointer hover, invisible & inert on touch */}
          <button
            className="absolute right-0 inset-y-0 flex items-center justify-center w-10
                       opacity-0 pointer-events-none
                       group-hover:opacity-100 group-hover:pointer-events-auto
                       transition-opacity text-muted-foreground hover:text-destructive z-10"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(true);
            }}
            aria-label={deleteLabel}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
