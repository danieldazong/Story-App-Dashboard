export type Genre = {
  value: string;
  label: string;
};

export const GENRES = [
  { value: "romance", label: "Romance" },
  { value: "werewolf", label: "Werewolf" },
  { value: "vampire", label: "Vampire" },
  { value: "fantasy", label: "Fantasy" },
  { value: "possessive_alpha", label: "Possessive Alpha" },
  { value: "billionaire", label: "Billionaire" },
  { value: "dark_romance", label: "Dark Romance" },
  { value: "paranormal", label: "Paranormal" },
  { value: "shifter", label: "Shifter" },
  { value: "enemies_to_lovers", label: "Enemies to Lovers" },
  { value: "sci_fi", label: "Sci-fi" },
  { value: "hfy", label: "HFY" },
] as const satisfies Genre[];
