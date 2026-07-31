
CREATE POLICY "internal read files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('comprovantes','anexos') AND public.is_internal(auth.uid()));
CREATE POLICY "internal upload files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('comprovantes','anexos') AND public.is_internal(auth.uid()));
CREATE POLICY "internal update files" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('comprovantes','anexos') AND public.is_internal(auth.uid()));
CREATE POLICY "internal delete files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('comprovantes','anexos') AND public.is_internal(auth.uid()));
