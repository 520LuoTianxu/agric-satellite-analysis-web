"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { useTranslations } from "next-intl";

import { bindSheetGesture } from "@/lib/sheet-gesture";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
            "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 max-md:bg-black/40",
            className
        )}
        {...props}
    />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
    const t = useTranslations("common");
    const localRef = React.useRef<HTMLDivElement | null>(null);
    const closeRef = React.useRef<HTMLButtonElement | null>(null);
    const setRefs = (node: HTMLDivElement | null) => {
        localRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    };

    React.useEffect(() => {
        const el = localRef.current;
        if (!el || !window.matchMedia("(max-width: 767px)").matches) return;
        const viewportHeight = () => window.innerHeight;
        const h = viewportHeight();
        const wants = el.scrollHeight;
        const mid = wants > h * 0.72 ? Math.round(h * 0.36) : Math.max(0, h - wants);
        let snap = mid;
        el.style.setProperty("--sheet-top", `${mid}px`);
        return bindSheetGesture({
            root: el,
            enabled: () => window.matchMedia("(max-width: 767px)").matches,
            readOffset: () => el.getBoundingClientRect().top,
            minOffset: () => 0,
            maxOffset: () => viewportHeight(),
            applyOffset: (offset) => {
                el.dataset.dragging = "true";
                el.style.setProperty("--sheet-top", `${offset}px`);
            },
            onSettle: ({ offset, velocity, moved, contentScrolled }) => {
                delete el.dataset.dragging;
                if (!moved) {
                    el.style.setProperty("--sheet-top", `${snap}px`);
                    return;
                }
                const viewHeight = viewportHeight();
                let next = mid;
                if (contentScrolled && offset <= 24) next = 0;
                else if (velocity <= -0.55) next = offset < mid ? 0 : mid;
                else if (velocity >= 0.55) next = offset > mid ? viewHeight : (offset > 24 ? mid : 0);
                else if (offset > mid + viewHeight * 0.16) next = viewHeight;
                else if (offset < mid * 0.45) next = 0;
                else next = mid;
                if (next >= viewHeight - 8) {
                    el.style.setProperty("--sheet-top", `${viewHeight}px`);
                    window.setTimeout(() => closeRef.current?.click(), 240);
                    return;
                }
                snap = next;
                el.style.setProperty("--sheet-top", `${next}px`);
            },
        });
    }, []);

    return (
    <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
            ref={setRefs}
            className={cn(
                "mobile-page-sheet fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
                className
            )}
            {...props}
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-2 z-10 hidden justify-center max-md:flex"
            >
                <span className="h-1 w-8 rounded-full bg-muted-foreground/50" />
            </div>
            {children}
            <DialogPrimitive.Close ref={closeRef} className="absolute right-4 top-4 rounded-full opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground max-md:top-3 max-md:bg-muted max-md:p-1 max-md:opacity-100">
                <X className="h-4 w-4" />
                <span className="sr-only">{t("close")}</span>
            </DialogPrimitive.Close>
        </DialogPrimitive.Content>
    </DialogPortal>
    );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            "flex flex-col space-y-1.5 text-center sm:text-left max-md:pt-3 max-md:text-left",
            className
        )}
        {...props}
    />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
            className
        )}
        {...props}
    />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={cn(
            "text-lg font-semibold leading-none tracking-tight",
            className
        )}
        {...props}
    />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
    />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
    Dialog,
    DialogPortal,
    DialogOverlay,
    DialogClose,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
};
