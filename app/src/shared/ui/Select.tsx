import { useId, type ComponentProps } from "react";
import styles from "./Field.module.css";

type SelectOption = { value: string; label: string };

type SelectProps = Omit<ComponentProps<"select">, "id" | "children"> & {
  label: string;
  options: ReadonlyArray<SelectOption>;
  placeholder?: string;
  hint?: string;
  error?: string;
};

export function Select({
  label,
  options,
  placeholder,
  hint,
  error,
  ...rest
}: SelectProps) {
  const reactId = useId();
  const fieldId = `select-${reactId}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
      </label>
      <select
        {...rest}
        id={fieldId}
        className={`${styles.input} ${error ? styles.invalid : ""}`}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
