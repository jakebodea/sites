import { ChevronLeftIcon, ChevronRightIcon, ExpandIcon } from "lucide-react";
import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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

const MAIN_SIZES = "(min-width: 1024px) 760px, 100vw";

/**
 * Project photos: the main image and thumbnails render on the server; this
 * island adds the full-screen viewer with keyboard and button navigation.
 */
const ProjectGallery = ({ images, title }: ProjectGalleryProps) => {
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const count = images.length;
  const current = images[selected];
  const step = useCallback(
    (delta: number) => {
      setSelected((index) => (index + delta + count) % count);
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
  if (current === undefined) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="media"
        size="media"
        className="group relative block"
        onClick={() => {
          setOpen(true);
        }}
        aria-label={`View ${title} photos full screen`}
      >
        <img
          src={current.src}
          srcSet={current.srcSet}
          sizes={MAIN_SIZES}
          width={current.width}
          height={current.height}
          alt={current.alt}
          fetchPriority="high"
          className="aspect-[4/3] w-full object-cover"
        />
        <span className="bg-navy-deep/80 absolute right-3 bottom-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-white">
          <ExpandIcon className="size-3.5" aria-hidden="true" />
          {count > 1 ? `${selected + 1} / ${count}` : "Enlarge"}
        </span>
      </Button>
      {count > 1 && (
        <ul
          className="grid grid-cols-4 gap-2 sm:grid-cols-6"
          aria-label="Photos"
        >
          {images.map((image, index) => (
            <li key={image.src}>
              <Button
                variant="media"
                size="media"
                aria-label={`Show photo ${index + 1}`}
                aria-current={index === selected ? "true" : undefined}
                onClick={() => {
                  setSelected(index);
                }}
              >
                <img
                  src={image.src}
                  srcSet={image.srcSet}
                  sizes="120px"
                  width={image.width}
                  height={image.height}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          variant="lightbox"
          className="max-w-[calc(100%-1rem)] sm:max-w-5xl"
          onKeyDown={onKeyDown}
        >
          <DialogTitle variant="lightbox">
            {title}
            {count > 1 && (
              <span className="ml-2 font-sans text-sm font-normal text-white/70">
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
            className="max-h-[78svh] w-full rounded-md object-contain"
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
      </Dialog>
    </div>
  );
};

export default ProjectGallery;
