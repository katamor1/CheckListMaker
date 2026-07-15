using System.Text.Json;
using CheckListMaker.Domain.Conditions;
using CheckListMaker.Domain.Scopes;
using CheckListMaker.Domain.Serialization;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace CheckListMaker.Domain.Tests.Conditions;

[TestClass]
public sealed class NumberConditionSerializationTests
{
    private static readonly JsonSerializerOptions Options =
        DomainJson.CreateOptions();

    [TestMethod]
    public void DecimalValues_AreWrittenAsNormalizedStrings()
    {
        var condition = new NumberCondition
        {
            Id = "COND-0001",
            Scope = new EntireDocumentScope(),
            Subject = "監視周期",
            Operator = NumericOperator.Between,
            Minimum = 12.500m,
            Maximum = 250m,
            Unit = "ms"
        };

        string json = JsonSerializer.Serialize(condition, Options);

        StringAssert.Contains(json, "\"minimum\":\"12.5\"");
        StringAssert.Contains(json, "\"maximum\":\"250\"");
    }

    [TestMethod]
    public void DecimalValues_ReadNormalizedStrings()
    {
        const string json =
            "{\"id\":\"COND-0001\",\"scope\":{\"type\":\"entire_document\"}," +
            "\"subject\":\"監視周期\",\"operator\":\"less_than_or_equal\"," +
            "\"value\":\"250\",\"unit\":\"ms\"}";

        NumberCondition? condition =
            JsonSerializer.Deserialize<NumberCondition>(json, Options);

        Assert.IsNotNull(condition);
        Assert.AreEqual(250m, condition.Value);
    }

    [DataTestMethod]
    [DataRow("{\"value\":250}")]
    [DataRow("{\"value\":\"0250\"}")]
    [DataRow("{\"value\":\"250.0\"}")]
    public void DecimalValues_RejectNumbersAndNonCanonicalStrings(
        string valueFragment)
    {
        string json =
            "{\"id\":\"COND-0001\",\"scope\":{\"type\":\"entire_document\"}," +
            "\"subject\":\"監視周期\",\"operator\":\"equal\"," +
            valueFragment[1..^1] + "}";

        Assert.ThrowsException<JsonException>(
            () => JsonSerializer.Deserialize<NumberCondition>(json, Options));
    }
}
