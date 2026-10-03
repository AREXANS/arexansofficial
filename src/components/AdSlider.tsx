import { FC, useEffect, useState, useCallback } from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

interface Ad {
  id: string;
  title: string;
  media_url: string;
  media_type: string;
  link?: string | null;
  link_url?: string | null;
}

interface AdSliderProps {
  ads: Ad[];
  autoPlay?: boolean;
  autoPlayInterval?: number;
}

const AdSlider: FC<AdSliderProps> = ({
  ads,
  autoPlay = true,
  autoPlayInterval = 4000
}) => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) return;

    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap());

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

  useEffect(() => {
    if (!api || !autoPlay) return;

    const intervalId = setInterval(() => {
      api.scrollNext();
    }, autoPlayInterval);

    return () => clearInterval(intervalId);
  }, [api, autoPlay, autoPlayInterval]);

  const scrollTo = useCallback((index: number) => {
    api?.scrollTo(index);
  }, [api]);

  if (ads.length === 0) return null;

  const handleAdClick = (ad: Ad) => {
    const linkUrl = ad.link_url || ad.link;
    if (linkUrl) {
      window.open(linkUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const getAdLink = (ad: Ad) => ad.link_url || ad.link;

  return (
    <div className="w-full py-4">
      <div className="relative">
        <Carousel
          setApi={setApi}
          opts={{
            align: "start",
            loop: true,
          }}
          className="w-full"
        >
          <CarouselContent>
            {ads.map((ad) => (
              <CarouselItem key={ad.id}>
                <div
                  onClick={() => handleAdClick(ad)}
                  className={`glass-card rounded-xl overflow-hidden aspect-[21/9] relative group ${getAdLink(ad) ? 'cursor-pointer' : ''}`}
                >
                  {ad.media_type === 'video' ? (
                    <video
                      src={ad.media_url}
                      className="w-full h-full object-cover"
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                  ) : (
                    <img
                      src={ad.media_url}
                      alt={ad.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  )}
                  
                  {/* Overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                  
                  {/* Title */}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-foreground font-display font-bold text-lg md:text-xl">
                      {ad.title}
                    </h3>
                  </div>

                  {/* Link indicator */}
                  {getAdLink(ad) && (
                    <div className="absolute top-3 right-3 bg-primary/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      Klik untuk info
                    </div>
                  )}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          
          {ads.length > 1 && (
            <>
              <CarouselPrevious className="left-2 bg-background/50 border-border hover:bg-background/80" />
              <CarouselNext className="right-2 bg-background/50 border-border hover:bg-background/80" />
            </>
          )}
        </Carousel>

        {/* Dots indicator */}
        {count > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            {Array.from({ length: count }).map((_, index) => (
              <button
                key={index}
                onClick={() => scrollTo(index)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  current === index
                    ? 'bg-primary w-6'
                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdSlider;
