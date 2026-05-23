import { useId, type ComponentProps } from "react";
import styles from "./Field.module.css";

type FieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  hint?: string;
  error?: string;
  multiline?: false;
};

type TextareaProps = Omit<ComponentProps<"textarea">, "id"> & {
  label: string;
  hint?: string;
  error?: string;
  multiline: true;
};

export function Field(props: FieldProps | TextareaProps) {
  const reactId = useId();
  const fieldId = `field-${reactId}`;
  const { label, hint, error } = props;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
      </label>
      {props.multiline ? (
        <textarea
          {...stripMeta(props)}
          id={fieldId}
          className={`${styles.input} ${styles.textarea} ${error ? styles.invalid : ""}`}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
        />
      ) : (
        <input
          {...stripMeta(props)}
          id={fieldId}
          className={`${styles.input} ${error ? styles.invalid : ""}`}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
        />
      )}
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

function stripMeta<T extends { label?: unknown; hint?: unknown; error?: unknown; multiline?: unknown }>(
  props: T,
) {
  const { label: _l, hint: _h, error: _e, multiline: _m, ...rest } = props;
  return rest;
}
