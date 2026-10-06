import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface GalleryImage {
  readonly src: string;
  readonly srcSet: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

interface ProjectGalleryProps {
  readonly title: string;
  readonly images: readonly GalleryImage[];
}

/** Portrait photos take one column; landscape photos span both, so the grid stays balanced. */
const isPortrait = (image: GalleryImage) => image.height > image.width;

/**
 * The rest of a project's photos as an editorial grid; any photo opens a
 * full-screen viewer with keyboard and button navigation.
 */
const ProjectGallery = ({ images, title }: ProjectGalleryProps) => {
  const [selected, setSelected] = useState<number>();
  const count = images.length;
  const current = selected === undefined ? undefined : images[selected];
  const step = useCallback(
    (delta: number) => {
      setSelected((index) =>
        index === undefined ? index : (index + delta + count) % count
      );
    },
    [count]
  );
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight") {
      step(1);
    } else if (event.key === "ArrowLeft") {
      step(-1);
    }
  };
  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6">
        {images.map((image, index) => (
          <li
            key={image.src}
            className={isPortrait(image) ? undefined : "sm:col-span-2"}
          >
            <Button
              variant="media"
              size="media"
              className="group block"
              aria-label={`View photo ${index + 1} of ${count} full screen`}
              onClick={() => {
                setSelected(index);
              }}
            >
              <img
                src={image.src}
                srcSet={image.srcSet}
                sizes={
                  isPortrait(image)
                    ? "(min-width: 640px) 50vw, 100vw"
                    : "(min-width: 1440px) 1360px, 100vw"
                }
                width={image.width}
                height={image.height}
                alt={image.alt}
                loading="lazy"
                className={cn(
                  isPortrait(image) ? "aspect-[4/5]" : "aspect-[3/2]",
                  "ease-expo w-full object-cover transition-transform duration-1600 group-hover:scale-[1.03] motion-reduce:transition-none"
                )}
              />
            </Button>
          </li>
        ))}
      </ul>
      <Dialog
        open={current !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(undefined);
          }
        }}
      >
        {current !== undefined && selected !== undefined && (
          <DialogContent
            variant="lightbox"
            className="max-w-[calc(100%-1rem)] sm:max-w-6xl"
            onKeyDown={onKeyDown}
          >
            <DialogTitle variant="lightbox">
              {title}
              {count > 1 && (
                <span className="ml-3 font-sans text-sm font-light text-white/60">
                  {selected + 1} of {count}
                </span>
              )}
            </DialogTitle>
            <img
              src={current.src}
              srcSet={current.srcSet}
              sizes="100vw"
              width={current.width}
              height={current.height}
              alt={current.alt}
              className="max-h-[78svh] w-full object-contain"
            />
            {count > 1 && (
              <div className="flex justify-between">
                <Button
                  variant="outline-inverse"
                  size="icon-lg"
                  onClick={() => {
                    step(-1);
                  }}
                  aria-label="Previous photo"
                >
                  <ChevronLeftIcon aria-hidden="true" />
                </Button>
                <Button
                  variant="outline-inverse"
                  size="icon-lg"
                  onClick={() => {
                    step(1);
                  }}
                  aria-label="Next photo"
                >
                  <ChevronRightIcon aria-hidden="true" />
                </Button>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
};

export default ProjectGallery;
