using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CheckListMaker.Domain.Serialization;

public sealed class NormalizedNullableDecimalStringConverter
    : JsonConverter<decimal?>
{
    private const string FormatPattern =
        "0.############################";

    public override decimal? Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return null;
        }

        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException(
                "Decimal values must be normalized JSON strings.");
        }

        string raw = reader.GetString() ?? string.Empty;
        const NumberStyles styles =
            NumberStyles.AllowLeadingSign |
            NumberStyles.AllowDecimalPoint;

        if (!decimal.TryParse(
                raw,
                styles,
                CultureInfo.InvariantCulture,
                out decimal value) ||
            !string.Equals(
                raw,
                Format(value),
                StringComparison.Ordinal))
        {
            throw new JsonException(
                "Decimal value is not in canonical form.");
        }

        return value;
    }

    public override void Write(
        Utf8JsonWriter writer,
        decimal? value,
        JsonSerializerOptions options)
    {
        if (value is null)
        {
            writer.WriteNullValue();
            return;
        }

        writer.WriteStringValue(Format(value.Value));
    }

    private static string Format(decimal value) =>
        value.ToString(FormatPattern, CultureInfo.InvariantCulture);
}
