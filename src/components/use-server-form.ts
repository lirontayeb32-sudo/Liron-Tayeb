"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import type { FormState } from "@/app/actions/auth";

/**
 * useActionState, but submitted manually so React does not reset the form afterwards —
 * when validation fails, everything the user typed stays in place.
 */
export function useServerForm(action: (prev: FormState, form: FormData) => Promise<FormState>) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(action, {});
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
  return { state, pending, onSubmit };
}
