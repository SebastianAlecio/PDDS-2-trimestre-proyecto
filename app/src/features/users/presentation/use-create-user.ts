import { apiFetch, FetchOptions } from "../../../shared/api/http-client";
import type { CreateUserFormValues } from "./CreateUserForm";

export function useCreateUser() {
  const create = async (payload: CreateUserFormValues) => {
    const fetchOptions: FetchOptions = {
        method: "POST",
        body: payload,
    }
    return await apiFetch<{ message: string }>("/users", fetchOptions);
  };

  return { create };
}