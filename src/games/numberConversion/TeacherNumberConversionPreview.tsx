import { useState } from "react";
import NumberConversionGame from "./NumberConversionGame";
import { createNumberConversionTeacherPreviewClient } from "./teacherPreviewClient";

/**
 * Teacher preview of the Number Conversion Challenge: the SAME `NumberConversionGame` students play (same board, same
 * answer input, same server engine), wired to the non-persistent teacher-preview transport (builder auth, no student
 * record, no best record, no rewards) and shown in "teacher-preview" mode (a quiet «معاينة المعلم» notice).
 * No gameplay lives here — only the transport + mode choice.
 */
export default function TeacherNumberConversionPreview({ token, onBack, embedded = false }: { token: string; onBack: () => void; embedded?: boolean }) {
  const [client] = useState(() => createNumberConversionTeacherPreviewClient(token));
  return <NumberConversionGame token={token} onBack={onBack} client={client} mode="teacher-preview" embedded={embedded} />;
}
