using CheckListMaker.Domain.Validation;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace CheckListMaker.Domain.Tests.Checklists;

[TestClass]
public sealed class IdentifierRulesTests
{
    [DataTestMethod]
    [DataRow("COND-0001", true)]
    [DataRow("COND-9999", true)]
    [DataRow("COND-01", false)]
    [DataRow("COND-001", false)]
    [DataRow("COND-00001", false)]
    [DataRow("cond-0001", false)]
    [DataRow("", false)]
    public void IsConditionId_RequiresCondPrefixAndFourDigits(
        string value,
        bool expected)
    {
        Assert.AreEqual(expected, IdentifierRules.IsConditionId(value));
    }

    [TestMethod]
    public void IsConditionId_NullIsInvalid()
    {
        Assert.IsFalse(IdentifierRules.IsConditionId(null));
    }
}
