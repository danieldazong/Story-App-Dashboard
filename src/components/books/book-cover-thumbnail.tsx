import Image from "next/image";
import { images } from "@/constants/images";
import type { CoverAsset } from "@/types/catalog";

export function BookCoverThumbnail({
  cover,
  alt,
}: {
  cover: CoverAsset;
  alt: string;
}) {
  if (cover.state === "missing") {
    return (
      <div className="flex h-[60px] w-10 shrink-0 items-center justify-center rounded border border-border bg-page">
        <Image
          src={images.coverPlaceholder}
          alt=""
          width={20}
          height={30}
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <Image
      src={cover.url}
      alt={alt}
      width={40}
      height={60}
      className="h-[60px] w-10 shrink-0 rounded object-cover"
    />
  );
}
