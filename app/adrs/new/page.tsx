import AdrGenerateForm from './AdrGenerateForm'

export default function NewAdrPage() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Generate Architecture Decision Record
      </h1>
      <AdrGenerateForm />
    </div>
  )
}
