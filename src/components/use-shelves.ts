"use client";
import { useQuery } from "@tanstack/react-query";
import { api, Shelf } from "./api-client";

/** Single shared shelves query so the list, summary and nav badge stay in sync. */
export const useShelves = () =>
  useQuery({
    queryKey: ["shelves"],
    queryFn: () => api<Shelf[]>("/shelves"),
  });
